import { getDatabase } from './connection.js';

async function columnExists(db, table, column) {
  if (db.client === 'postgres') {
    const row = await db
      .prepare(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ?
          AND column_name = ?
      `)
      .get(table, column);
    return Boolean(row);
  }

  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

async function addColumnIfMissing(db, table, column, definition) {
  if (db.client === 'postgres') {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition};`);
    return;
  }

  if (!(await columnExists(db, table, column))) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function migrateUserStatusConstraint(db) {
  if (db.client !== 'sqlite') {
    return;
  }

  const usersTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();

  if (!usersTable?.sql || usersTable.sql.includes("'DELETED'")) {
    return;
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE users_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      national_id TEXT UNIQUE,
      permanent_address TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_next (
      id, name, email, password_hash, phone, national_id, permanent_address, role, status, created_at
    )
    SELECT id, name, email, password_hash, phone, national_id, permanent_address, role, status, created_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_next RENAME TO users;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

async function migrateExistingSchema(db) {
  await migrateUserStatusConstraint(db);
  await addColumnIfMissing(db, 'users', 'phone', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'users', 'national_id', 'TEXT');
  await addColumnIfMissing(db, 'users', 'permanent_address', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'users', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'");
  await addColumnIfMissing(db, 'doctor_profiles', 'availability_summary', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'doctor_profiles', 'consultation_fee', db.client === 'postgres' ? 'DOUBLE PRECISION NOT NULL DEFAULT 0' : 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'doctor_profiles', 'qualification_title', "TEXT NOT NULL DEFAULT 'GENERAL_PRACTITIONER'");
  await addColumnIfMissing(db, 'doctor_profiles', 'years_of_experience', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'doctor_profiles', 'gender', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'doctor_profiles', 'languages_spoken', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'doctor_profiles', 'average_rating', db.client === 'postgres' ? 'DOUBLE PRECISION NOT NULL DEFAULT 4.8' : 'REAL NOT NULL DEFAULT 4.8');
  await addColumnIfMissing(db, 'doctor_profiles', 'review_count', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'appointments', 'cancellation_reason', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'appointments', 'cancelled_by', 'INTEGER');
  await addColumnIfMissing(db, 'appointments', 'cancelled_at', db.client === 'postgres' ? 'TIMESTAMPTZ' : 'TEXT');
  await addColumnIfMissing(db, 'appointments', 'video_room_url', 'TEXT');
  await addColumnIfMissing(db, 'appointments', 'video_room_provider', 'TEXT');
  await addColumnIfMissing(db, 'medical_records', 'appointment_id', db.client === 'postgres' ? 'BIGINT' : 'INTEGER');
  await addColumnIfMissing(db, 'medical_documents', 'storage_provider', "TEXT NOT NULL DEFAULT 'local'");
  await addColumnIfMissing(db, 'medical_documents', 'storage_key', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'symptom_summaries', 'appointment_id', db.client === 'postgres' ? 'BIGINT' : 'INTEGER');
  await addColumnIfMissing(db, 'symptom_summaries', 'medical_record_id', db.client === 'postgres' ? 'BIGINT' : 'INTEGER');
  await addColumnIfMissing(db, 'symptom_summaries', 'severity', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'symptom_summaries', 'temperature', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'symptom_summaries', 'conditional_answers', db.client === 'postgres' ? "JSONB NOT NULL DEFAULT '{}'::jsonb" : "TEXT NOT NULL DEFAULT '{}'");
  await addColumnIfMissing(db, 'symptom_summaries', 'red_flags', db.client === 'postgres' ? "JSONB NOT NULL DEFAULT '[]'::jsonb" : "TEXT NOT NULL DEFAULT '[]'");
  await addColumnIfMissing(db, 'symptom_summaries', 'priority', "TEXT NOT NULL DEFAULT 'NORMAL'");
  await addColumnIfMissing(db, 'symptom_summaries', 'doctor_summary', "TEXT NOT NULL DEFAULT ''");
}

function buildGeneratedPhone(userId, attempt = 0) {
  if (attempt === 0) {
    return `099${String(userId).padStart(7, '0')}`.slice(0, 10);
  }

  return `098${String(userId).padStart(5, '0')}${String(attempt).padStart(2, '0')}`.slice(0, 10);
}

async function migrateDuplicateUserPhones(db) {
  const duplicates = await db
    .prepare(`
      SELECT phone
      FROM users
      WHERE phone IS NOT NULL
        AND phone <> ''
      GROUP BY phone
      HAVING COUNT(*) > 1
    `)
    .all();

  for (const duplicate of duplicates) {
    const users = await db
      .prepare(`
        SELECT id, phone
        FROM users
        WHERE phone = ?
        ORDER BY id ASC
      `)
      .all(duplicate.phone);

    for (const user of users.slice(1)) {
      let attempt = 0;
      let nextPhone = buildGeneratedPhone(user.id, attempt);

      while (await db.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').get(nextPhone, user.id)) {
        attempt += 1;
        nextPhone = buildGeneratedPhone(user.id, attempt);
      }

      // Existing local/demo databases may contain duplicate phone values from before
      // phone-number login was introduced. Keep the first account unchanged and give
      // later duplicates a valid placeholder so the unique index can be created safely.
      await db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(nextPhone, user.id);
      console.warn(`Updated duplicate phone for user ${user.id} to ${nextPhone}.`);
    }
  }
}

function sqliteSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      national_id TEXT UNIQUE,
      permanent_address TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      specialty TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      availability TEXT NOT NULL DEFAULT '',
      availability_summary TEXT NOT NULL DEFAULT '',
      consultation_fee REAL NOT NULL DEFAULT 0,
      qualification_title TEXT NOT NULL DEFAULT 'GENERAL_PRACTITIONER',
      years_of_experience INTEGER NOT NULL DEFAULT 0,
      gender TEXT NOT NULL DEFAULT '',
      languages_spoken TEXT NOT NULL DEFAULT '',
      rating REAL NOT NULL DEFAULT 4.8,
      average_rating REAL NOT NULL DEFAULT 4.8,
      review_count INTEGER NOT NULL DEFAULT 0,
      patients_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
      cancellation_reason TEXT NOT NULL DEFAULT '',
      cancelled_by INTEGER,
      cancelled_at TEXT,
      video_room_url TEXT,
      video_room_provider TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS doctor_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doctor_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration INTEGER NOT NULL CHECK (slot_duration > 0),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (doctor_id, weekday),
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration INTEGER NOT NULL CHECK (slot_duration > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS doctor_unavailability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (doctor_id, date),
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      reason TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_id INTEGER,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS medical_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      url TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_key TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (record_id) REFERENCES medical_records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS symptom_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      appointment_id INTEGER,
      medical_record_id INTEGER,
      main_symptom TEXT NOT NULL,
      duration TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT '',
      fever TEXT NOT NULL,
      temperature TEXT NOT NULL DEFAULT '',
      medication TEXT NOT NULL,
      allergies TEXT NOT NULL,
      previous_history TEXT NOT NULL,
      conditional_answers TEXT NOT NULL DEFAULT '{}',
      red_flags TEXT NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      doctor_summary TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS consultation_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      symptoms TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      prescription TEXT NOT NULL,
      advice TEXT NOT NULL,
      follow_up TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_role TEXT NOT NULL DEFAULT 'anonymous',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `;
}

export function postgresSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      national_id TEXT UNIQUE,
      permanent_address TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      specialty TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      availability TEXT NOT NULL DEFAULT '',
      availability_summary TEXT NOT NULL DEFAULT '',
      consultation_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
      qualification_title TEXT NOT NULL DEFAULT 'GENERAL_PRACTITIONER',
      years_of_experience INTEGER NOT NULL DEFAULT 0,
      gender TEXT NOT NULL DEFAULT '',
      languages_spoken TEXT NOT NULL DEFAULT '',
      rating DOUBLE PRECISION NOT NULL DEFAULT 4.8,
      average_rating DOUBLE PRECISION NOT NULL DEFAULT 4.8,
      review_count INTEGER NOT NULL DEFAULT 0,
      patients_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY,
      patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scheduled_date DATE NOT NULL,
      scheduled_time TIME NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
      cancellation_reason TEXT NOT NULL DEFAULT '',
      cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      cancelled_at TIMESTAMPTZ,
      video_room_url TEXT,
      video_room_provider TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor_reviews (
      id BIGSERIAL PRIMARY KEY,
      appointment_id BIGINT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor_availability (
      id BIGSERIAL PRIMARY KEY,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      slot_duration INTEGER NOT NULL CHECK (slot_duration > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_id, weekday)
    );

    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id BIGSERIAL PRIMARY KEY,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      slot_duration INTEGER NOT NULL CHECK (slot_duration > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor_unavailability (
      id BIGSERIAL PRIMARY KEY,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_id, date)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id BIGSERIAL PRIMARY KEY,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      reason TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medical_records (
      id BIGSERIAL PRIMARY KEY,
      patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medical_documents (
      id BIGSERIAL PRIMARY KEY,
      record_id BIGINT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      url TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_key TEXT NOT NULL DEFAULT '',
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS symptom_summaries (
      id BIGSERIAL PRIMARY KEY,
      patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
      medical_record_id BIGINT REFERENCES medical_records(id) ON DELETE SET NULL,
      main_symptom TEXT NOT NULL,
      duration TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT '',
      fever TEXT NOT NULL,
      temperature TEXT NOT NULL DEFAULT '',
      medication TEXT NOT NULL,
      allergies TEXT NOT NULL,
      previous_history TEXT NOT NULL,
      conditional_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      doctor_summary TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consultation_notes (
      id BIGSERIAL PRIMARY KEY,
      appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      doctor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      patient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symptoms TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      prescription TEXT NOT NULL,
      advice TEXT NOT NULL,
      follow_up TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL DEFAULT 'anonymous',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id BIGINT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

function indexAndCompatibilitySql() {
  return `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id_unique
    ON users(national_id)
    WHERE national_id IS NOT NULL AND national_id <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON users(phone)
    WHERE phone IS NOT NULL AND phone <> '';

    CREATE INDEX IF NOT EXISTS idx_medical_records_appointment_id
    ON medical_records(appointment_id);

    CREATE INDEX IF NOT EXISTS idx_symptom_summaries_appointment_id
    ON symptom_summaries(appointment_id);

    CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_weekday
    ON doctor_schedules(doctor_id, weekday);

    CREATE INDEX IF NOT EXISTS idx_doctor_reviews_doctor_id
    ON doctor_reviews(doctor_id);

    CREATE INDEX IF NOT EXISTS idx_appointments_patient_datetime_status
    ON appointments(patient_id, scheduled_date, scheduled_time, status);

    CREATE INDEX IF NOT EXISTS idx_appointments_doctor_datetime_status
    ON appointments(doctor_id, scheduled_date, scheduled_time, status);

    CREATE INDEX IF NOT EXISTS idx_leave_requests_doctor_date_status
    ON leave_requests(doctor_id, date, status);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_role
    ON audit_logs(action, actor_role);

    INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time, slot_duration)
    SELECT doctor_id, weekday, start_time, end_time, slot_duration
    FROM doctor_availability legacy
    WHERE NOT EXISTS (
      SELECT 1
      FROM doctor_schedules schedules
      WHERE schedules.doctor_id = legacy.doctor_id
        AND schedules.weekday = legacy.weekday
        AND schedules.start_time = legacy.start_time
        AND schedules.end_time = legacy.end_time
        AND schedules.slot_duration = legacy.slot_duration
    );
  `;
}

export async function initializeDatabase() {
  const db = getDatabase();

  await db.exec(db.client === 'postgres' ? postgresSchemaSql() : sqliteSchemaSql());
  await migrateExistingSchema(db);
  await migrateDuplicateUserPhones(db);
  await db.exec(indexAndCompatibilitySql());
}
