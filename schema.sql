CREATE TABLE IF NOT EXISTS appliances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    wattage INTEGER NOT NULL CHECK (wattage > 0),
    priority INTEGER NOT NULL CHECK (priority > 0),
    state TEXT NOT NULL CHECK (state IN ('running', 'off', 'shed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appliance_id INTEGER,
    message TEXT NOT NULL,
    cause TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appliance_id) REFERENCES appliances(id) ON DELETE SET NULL
);
