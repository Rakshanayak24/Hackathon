# Inverter Load Manager

A small FastAPI, SQLite and dependency-free browser application for safely coordinating an 800W home inverter.

## Run it

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`. SQLite data is stored in `inverter.db`, which is created automatically from the committed [schema.sql](schema.sql).

## Design notes

Each appliance persists one explicit state: `running`, `off`, or `shed`. `shed` means the person still wants the appliance on, whereas `off` means they do not; this distinction prevents explicitly switched-off loads from returning. The request-state endpoint owns all load decisions within one SQLite transaction, so an accepted operation cannot leave a saved total above 800W. To turn a device on, it considers only running devices with a numerically larger (lower importance) priority, shedding least-important ones first. If those candidates cannot free enough capacity, it rejects the request without writing changes. After an off or delete operation, the same transaction attempts restoration; it also checks after shedding, since that process can free more capacity than was needed. I restore the highest-priority waiting appliance first, then registration order for ties, skipping any device that does not fit and continuing to consider smaller waiting loads; this favors essential devices while avoiding unused capacity. The event table records registration, user requests, shedding, restoration, and deletion for the UI activity feed. With more time I would add API tests for transaction invariants and browser-side optimistic-update handling.
