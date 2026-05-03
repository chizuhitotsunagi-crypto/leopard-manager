-- 個体マスタ
CREATE TABLE IF NOT EXISTS animals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sex TEXT DEFAULT 'U',         -- M=オス, F=メス, U=不明（販売個体は基本U）
  category TEXT DEFAULT 'named', -- named=名前付き, sale=販売個体（番号）
  morph TEXT,                    -- モルフ情報
  lineage TEXT,                  -- 系統情報
  birth_date TEXT,               -- 生年月日
  photo_url TEXT,                -- 写真URL
  source_url TEXT,               -- 詳細情報の参照元URL
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 体重記録
CREATE TABLE IF NOT EXISTS weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  animal_id INTEGER NOT NULL,
  measured_at DATE NOT NULL,
  weight_g REAL,
  notes TEXT,
  FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_weights_animal ON weights(animal_id, measured_at);

-- 担当者マスタ
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

-- 餌マスタ
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- 日次共通記録
CREATE TABLE IF NOT EXISTS daily_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_date DATE NOT NULL UNIQUE,
  record_time TEXT,
  cleaning INTEGER NOT NULL DEFAULT 1,
  disinfection INTEGER NOT NULL DEFAULT 1,
  maintenance INTEGER NOT NULL DEFAULT 1,
  count_status TEXT NOT NULL DEFAULT '変動なし',
  health_status TEXT NOT NULL DEFAULT '良好',
  cleaning_status TEXT NOT NULL DEFAULT '掃除済み',
  staff_id INTEGER,
  notes TEXT,
  is_full_maintenance INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id)
);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_records(record_date);

-- 個体別給餌・排泄記録
CREATE TABLE IF NOT EXISTS feeding_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_record_id INTEGER NOT NULL,
  animal_id INTEGER NOT NULL,
  no_feeding INTEGER NOT NULL DEFAULT 1,
  amount TEXT,
  poop TEXT,
  notes TEXT,
  FOREIGN KEY (daily_record_id) REFERENCES daily_records(id) ON DELETE CASCADE,
  FOREIGN KEY (animal_id) REFERENCES animals(id),
  UNIQUE(daily_record_id, animal_id)
);
CREATE INDEX IF NOT EXISTS idx_feeding_animal ON feeding_records(animal_id);

-- 餌の関連付け（多対多 = 複数選択を可能にする）
CREATE TABLE IF NOT EXISTS feeding_foods (
  feeding_record_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  PRIMARY KEY (feeding_record_id, food_id),
  FOREIGN KEY (feeding_record_id) REFERENCES feeding_records(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id)
);

-- 通知ログ（重複送信防止）
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL,
  target_date DATE,
  target_animal_id INTEGER,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  message TEXT,
  success INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_notif_lookup ON notification_log(notification_type, target_date, target_animal_id);

-- 設定
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
