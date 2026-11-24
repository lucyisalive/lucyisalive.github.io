'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../magic-shop-catalog.js'), 'utf8'), { window });
const catalog = window.HanziMagicShopCatalog;
const expected = [
  ['橡木书桌', 60], ['星纹木椅', 30], ['暗紫丝绒软椅', 120], ['月纹小茶桌', 45],
  ['低语书架', 90], ['铜把手床头柜', 45], ['星纹地毯', 60], ['星月床品', 75],
  ['墨蓝丝绒窗帘', 60], ['流动星空挂毯', 90], ['玫瑰铜镜', 90], ['小壁炉', 150],
  ['黄铜烛台', 15], ['会写符文的羽毛笔', 15], ['幽光药瓶组', 30], ['悬浮茶具', 45],
  ['深蓝星图册', 45], ['小铜坩埚', 60], ['水晶球', 75], ['会回应的画像', 120],
  ['悬浮扫帚', 45], ['星空旅行箱', 75], ['金羽小鸟', 300], ['巫师猫', 1000],
];
assert.deepEqual(JSON.parse(JSON.stringify(catalog.items.map(item => [item.name, item.price]))), expected);
assert.equal(new Set(catalog.items.map(item => item.id)).size, 24);
const atlases = ['furniture', 'room', 'curios', 'companions'];
for (const file of new Set([...catalog.items.map(item => item.art.src), 'assets/shop/special-motion-atlas.webp'])) {
  const bytes = fs.readFileSync(path.join(__dirname, '..', file));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'Product artwork exists: ' + file);
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', 'Product artwork has a real WebP header: ' + file);
}
catalog.items.forEach((item, index) => {
  assert.equal(catalog.get(item.id), item);
  assert.equal(catalog.byId[item.id], item);
  assert.ok(item.description && item.effect && item.category && item.slot);
  assert.equal(item.magic, item.effect);
  assert.equal(item.art.src, 'assets/shop/' + atlases[Math.floor(index / 6)] + '-atlas.webp');
  assert.equal(item.art.col, index % 2);
  assert.equal(item.art.row, Math.floor(index % 6 / 2));
  assert.ok(Object.isFrozen(item) && Object.isFrozen(item.art));
});
assert.equal(catalog.get('unknown-item'), null);
assert.equal(catalog.get('toString'), null);
assert.equal(catalog.get('__proto__'), null);
assert.equal(Math.max(...catalog.items.map(item => item.price)), catalog.get('wizard-cat').price);
assert.ok(!catalog.get('velvet-armchair').description.includes('附带猫'));
console.log('PASS magic-shop-catalog: approved 24 names/prices, unique items, art cells, immutable catalog');
