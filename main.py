import sqlite3
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).parent
DATABASE = BASE_DIR / "inverter.db"
CAPACITY = 800

app = FastAPI(title="Inverter Load Manager")


class ApplianceIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    wattage: int = Field(gt=0)
    priority: int = Field(gt=0)


class StateRequest(BaseModel):
    desired_state: str


@contextmanager
def db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize():
    with db() as connection:
        connection.executescript((BASE_DIR / "schema.sql").read_text())


@app.on_event("startup")
def startup():
    initialize()


def snapshot(connection):
    appliances = [dict(row) for row in connection.execute(
        "SELECT id, name, wattage, priority, state FROM appliances ORDER BY priority, id"
    )]
    load = sum(item["wattage"] for item in appliances if item["state"] == "running")
    return {"capacity": CAPACITY, "load": load, "remaining": CAPACITY - load, "appliances": appliances}


def log(connection, appliance_id, message, cause):
    connection.execute("INSERT INTO events (appliance_id, message, cause) VALUES (?, ?, ?)",
                       (appliance_id, message, cause))


def restore_shed(connection):
    """Restore most-important waiting loads first; ties use earliest registration."""
    load = connection.execute("SELECT COALESCE(SUM(wattage), 0) FROM appliances WHERE state='running'").fetchone()[0]
    waiting = connection.execute(
        "SELECT * FROM appliances WHERE state='shed' ORDER BY priority ASC, id ASC"
    ).fetchall()
    restored = []
    for item in waiting:
        if load + item["wattage"] <= CAPACITY:
            connection.execute("UPDATE appliances SET state='running' WHERE id=?", (item["id"],))
            load += item["wattage"]
            message = f"{item['name']} restored automatically; capacity is available."
            log(connection, item["id"], message, "auto_restore")
            restored.append(message)
    return restored


@app.get("/api/status")
def status():
    with db() as connection:
        return snapshot(connection)


@app.get("/api/events")
def events():
    with db() as connection:
        return [dict(row) for row in connection.execute(
            "SELECT id, message, cause, created_at FROM events ORDER BY id DESC LIMIT 50"
        )]


@app.post("/api/appliances", status_code=201)
def create_appliance(data: ApplianceIn):
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Name cannot be blank.")
    with db() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO appliances (name, wattage, priority, state) VALUES (?, ?, ?, 'off')",
                (name, data.wattage, data.priority),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "An appliance with that name already exists.")
        log(connection, cursor.lastrowid, f"{name} registered in the off state.", "registered")
        return snapshot(connection)


@app.delete("/api/appliances/{appliance_id}")
def delete_appliance(appliance_id: int):
    with db() as connection:
        item = connection.execute("SELECT * FROM appliances WHERE id=?", (appliance_id,)).fetchone()
        if not item:
            raise HTTPException(404, "Appliance not found.")
        name = item["name"]
        connection.execute("DELETE FROM appliances WHERE id=?", (appliance_id,))
        log(connection, None, f"{name} deleted.", "deleted")
        restored = restore_shed(connection)
        return {**snapshot(connection), "messages": restored}


@app.post("/api/appliances/{appliance_id}/state")
def request_state(appliance_id: int, request: StateRequest):
    if request.desired_state not in ("on", "off"):
        raise HTTPException(422, "desired_state must be 'on' or 'off'.")
    with db() as connection:
        item = connection.execute("SELECT * FROM appliances WHERE id=?", (appliance_id,)).fetchone()
        if not item:
            raise HTTPException(404, "Appliance not found.")
        messages = []
        if request.desired_state == "off":
            if item["state"] != "off":
                connection.execute("UPDATE appliances SET state='off' WHERE id=?", (appliance_id,))
                message = f"{item['name']} switched off by request."
                log(connection, appliance_id, message, "user_off")
                messages.append(message)
            messages.extend(restore_shed(connection))
            return {**snapshot(connection), "messages": messages}

        if item["state"] == "running":
            return {**snapshot(connection), "messages": [f"{item['name']} is already running."]}

        load = connection.execute("SELECT COALESCE(SUM(wattage), 0) FROM appliances WHERE state='running'").fetchone()[0]
        needed = max(0, load + item["wattage"] - CAPACITY)
        # Only lower-importance (larger priority number) loads may be shed.
        candidates = connection.execute(
            "SELECT * FROM appliances WHERE state='running' AND priority > ? ORDER BY priority DESC, id DESC",
            (item["priority"],),
        ).fetchall()
        shed, freed = [], 0
        for candidate in candidates:
            if freed >= needed:
                break
            shed.append(candidate)
            freed += candidate["wattage"]
        if freed < needed:
            detail = (f"Cannot run {item['name']}: it needs {needed}W more, but only {freed}W "
                      "can be shed without interrupting equal or higher priority appliances.")
            raise HTTPException(409, detail)
        for candidate in shed:
            connection.execute("UPDATE appliances SET state='shed' WHERE id=?", (candidate["id"],))
            message = f"{candidate['name']} shed to make room for {item['name']}."
            log(connection, candidate["id"], message, "auto_shed")
            messages.append(message)
        connection.execute("UPDATE appliances SET state='running' WHERE id=?", (appliance_id,))
        message = f"{item['name']} is now running."
        log(connection, appliance_id, message, "user_on")
        messages.append(message)
        # Greedy shedding can free more room than the request needed.
        messages.extend(restore_shed(connection))
        return {**snapshot(connection), "messages": messages}


app.mount("/", StaticFiles(directory=BASE_DIR / "frontend" / "dist", html=True), name="frontend")
