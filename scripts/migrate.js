#!/usr/bin/env node
'use strict';
require('dotenv').config();
const { initialize, getDb } = require('../lib/db');

const animalSeed = [
  {
    name: 'ノブナガ', sex: 'M', category: 'named',
    morph: '原種モンタヌス (Wild Type Montanus)', lineage: '原種モンタヌス',
    photo_url: 'https://lambent-piroshki-91574b.netlify.app/images/%E5%8E%9F%E7%A8%AE%E3%83%A2%E3%83%B3%E3%83%86%E3%83%B3%E3%83%BB%E3%83%8E%E3%83%95%E3%82%99%E3%83%8A%E3%82%AB%E3%82%99/photo1.jpg',
    source_url: 'https://lambent-piroshki-91574b.netlify.app/',
    display_order: 1
  },
  {
    name: 'もみじ', sex: 'M', category: 'named',
    morph: 'タンジェリン（ブラッド × マンダリン）',
    lineage: 'Tangerine_BloodxMandarin',
    birth_date: '2021-07-24',
    photo_url: 'https://lambent-piroshki-91574b.netlify.app/images/%E3%82%BF%E3%83%B3%E3%82%B7%E3%82%99%E3%82%A7%E3%83%AA%E3%83%B3%E3%83%BB%E3%82%82%E3%81%BF%E3%81%97%E3%82%99/photo1.jpg',
    source_url: 'https://lambent-piroshki-91574b.netlify.app/',
    display_order: 2
  },
  {
    name: 'アリストテレス', sex: 'M', category: 'named',
    morph: '原種アフガン F1 (Eublepharis afghanicus)',
    lineage: '原種アフガン',
    birth_date: '2020-07-10',
    photo_url: 'https://lambent-piroshki-91574b.netlify.app/images/%E5%8E%9F%E7%A8%AE%E3%82%A2%E3%83%95%E3%82%AB%E3%82%99%E3%83%B3%E3%83%BB%E3%82%A2%E3%83%AA%E3%82%B9%E3%83%88%E3%83%86%E3%83%AC%E3%82%B9/photo1.jpg',
    source_url: 'https://lambent-piroshki-91574b.netlify.app/',
    display_order: 3
  },
  {
    name: 'テルース', sex: 'F', category: 'named',
    morph: '原種アフガン (Wild Type Afghan)', lineage: '原種アフガン',
    photo_url: 'https://lambent-piroshki-91574b.netlify.app/images/PP4/IMG_0999%203%EF%BC%88%E5%B0%8F%EF%BC%89.jpeg',
    source_url: 'https://lambent-piroshki-91574b.netlify.app/',
    display_order: 4
  },
  { name: '①', sex: 'U', category: 'sale', morph: '原種アフガン (F2)', lineage: 'Wild Type Afghan F2',
    birth_date: '2023-05-15', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 5 },
  { name: '②', sex: 'U', category: 'sale', morph: 'マキュラリクロスタンジェリン', lineage: 'Macularius × Tangerine',
    birth_date: '2023-05-23', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 6 },
  { name: '③', sex: 'U', category: 'sale', morph: 'モンテンクロスタンジェリン', lineage: 'Montanus × Tangerine',
    birth_date: '2023-05-23', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 7 },
  { name: '④', sex: 'U', category: 'sale', morph: '原種アフガン (F2)', lineage: 'Wild Type Afghan F2',
    birth_date: '2023-06-03', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 8 },
  { name: '⑥', sex: 'U', category: 'sale', morph: 'マキュラリクロスタンジェリン', lineage: 'Macularius × Tangerine',
    birth_date: '2023-06-30', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 9 },
  { name: '⑦', sex: 'U', category: 'sale', morph: 'マキュラリクロスタンジェリン', lineage: 'Macularius × Tangerine',
    birth_date: '2023-07-15', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 10 },
  { name: '⑧', sex: 'U', category: 'sale', morph: '原種アフガン (F2)', lineage: 'Wild Type Afghan F2',
    birth_date: '2023-07-23', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 11 },
  { name: '⑨', sex: 'U', category: 'sale', morph: 'マキュラリクロスタンジェリン', lineage: 'Macularius × Tangerine',
    birth_date: '2023-07-25', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 12 },
  { name: '⑩', sex: 'U', category: 'sale', morph: 'モンテンクロスタンジェリン', lineage: 'Montanus × Tangerine',
    birth_date: '2023-07-26', photo_url: 'https://cattleya.kigo.design/img/campaign/product/no_image.png',
    source_url: 'https://cattleya.kigo.design/p/campaign/igf5B8bj/oxLomwfz', display_order: 13 }
];

(async () => {
  await initialize();
  const db = getDb();

  // ALTER TABLE で既存カラム追加
  const tableInfo = (await db.execute("PRAGMA table_info(animals)")).rows;
  const existingCols = tableInfo.map(c => c.name);
  const newCols = [
    ['sex', "TEXT DEFAULT 'U'"],
    ['category', "TEXT DEFAULT 'named'"],
    ['morph', 'TEXT'],
    ['lineage', 'TEXT'],
    ['birth_date', 'TEXT'],
    ['photo_url', 'TEXT'],
    ['source_url', 'TEXT']
  ];
  for (const [col, def] of newCols) {
    if (!existingCols.includes(col)) {
      console.log(`+ animals.${col} 追加`);
      await db.execute(`ALTER TABLE animals ADD COLUMN ${col} ${def}`);
    }
  }

  let updated = 0;
  for (const a of animalSeed) {
    const r = await db.execute({
      sql: `UPDATE animals SET
              sex=?, category=?, morph=?, lineage=?, birth_date=?,
              photo_url=?, source_url=?, display_order=?
            WHERE name=?`,
      args: [a.sex, a.category, a.morph || null, a.lineage || null, a.birth_date || null,
             a.photo_url || null, a.source_url || null, a.display_order, a.name]
    });
    if (r.rowsAffected > 0) updated++;
  }

  await db.execute("UPDATE animals SET active = 0 WHERE name = '⑤'");

  console.log(`✅ マイグレーション完了`);
  console.log(`   個体メタ情報を ${updated} 件更新`);
  console.log(`   ⑤ は欠番のため非表示化`);
})().catch(e => { console.error(e); process.exit(1); });
