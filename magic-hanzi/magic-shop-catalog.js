(function (root) {
  'use strict';

  // The approved 2026-11-24 list. Art cells follow this order, six per atlas.
  const rows = [
    ['oak-desk', '橡木书桌', 60, '家具', '书桌', '厚实橡木桌面，桌沿刻着古老符纹。', '桌沿的古老符纹依次亮起，抽屉缝透出金光。'],
    ['star-chair', '星纹木椅', 30, '家具', '木椅', '椅背刻着一颗小星星的木椅。', '椅背星纹微亮，椅子自己轻轻拉开一点。'],
    ['velvet-armchair', '暗紫丝绒软椅', 120, '家具', '软椅', '独立出售的暗紫软椅，带着柔软靠枕。', '靠枕轻轻鼓起，椅脚短暂离地，再缓缓落下。'],
    ['moon-tea-table', '月纹小茶桌', 45, '家具', '茶桌', '桌面嵌着月亮纹样的小圆桌。', '桌面上的月亮从弯月慢慢变成满月。'],
    ['whisper-bookshelf', '低语书架', 90, '家具', '书架', '摆满旧书的木书架，书脊藏着微光。', '书脊轮流发光，一本书自行抽出，再回到原位。'],
    ['brass-bedside-cabinet', '铜把手床头柜', 45, '家具', '床头柜', '带着黄铜把手的床边小柜。', '把手自己转动，柜缝逸出几粒萤光。'],
    ['star-rug', '星纹地毯', 60, '布置', '地毯', '铺在地板上的柔软星纹地毯。', '星星连成图案，地毯边角轻轻浮动。'],
    ['star-moon-bedding', '星月床品', 75, '布置', '床品', '给原有木床铺上一片星月夜空。', '被面星星明暗变化，像把夜空盖在床上。'],
    ['blue-velvet-curtains', '墨蓝丝绒窗帘', 60, '布置', '窗帘', '挂在窗边的墨蓝丝绒窗帘。', '无风轻摆，帘边流过一线银光。'],
    ['moving-star-tapestry', '流动星空挂毯', 90, '布置', '挂毯', '织着深蓝夜空与星座的挂毯。', '星座缓缓移动，偶尔连成一只飞鸟。'],
    ['rose-copper-mirror', '玫瑰铜镜', 90, '布置', '铜镜', '玫瑰花纹环绕着一面古老铜镜。', '镜中短暂浮现一片月下森林。'],
    ['little-fireplace', '小壁炉', 150, '布置', '壁炉', '一座给小屋添上暖光的小壁炉。', '炉火偶尔卷成一条小火龙，再散回火星。'],
    ['brass-candlestick', '黄铜烛台', 15, '奇物', '烛台', '一支点着暖金烛火的黄铜烛台。', '点一下，烛火由暖金变成幽蓝，再变回来。'],
    ['rune-quill', '会写符文的羽毛笔', 15, '奇物', '羽毛笔', '一支会自己写下魔法符号的羽毛笔。', '羽毛笔自己立起，写下几个发光符号。'],
    ['glowing-potions', '幽光药瓶组', 30, '奇物', '药瓶', '装着暗绿与深紫药液的小玻璃瓶。', '暗绿、深紫的药液缓缓流动，冒出小光泡。'],
    ['floating-tea-set', '悬浮茶具', 45, '奇物', '茶具', '一把茶壶和配套茶杯，静静等着开茶会。', '茶壶自己升起，往配套茶杯里倒茶。'],
    ['blue-star-atlas', '深蓝星图册', 45, '奇物', '星图册', '深蓝封面里收藏着一页页星图。', '书页自行翻动，纸上的星图缓缓移动。'],
    ['copper-cauldron', '小铜坩埚', 60, '奇物', '坩埚', '一只冒着轻盈小泡泡的铜坩埚。', '泡泡升起来，变成小星星或弯月后消失。'],
    ['crystal-ball', '水晶球', 75, '奇物', '水晶球', '透明水晶里藏着朦胧星云。', '星云散开，短暂显出一座远方城堡。'],
    ['answering-portrait', '会回应的画像', 120, '奇物', '画像', '画着一位捧茶老巫师的画像。', '画里的老巫师抬眼看你，点头，喝一口茶。'],
    ['floating-broom', '悬浮扫帚', 45, '奇物', '扫帚', '一把会轻轻浮起的旧木扫帚。', '离地转一圈，扫出一道短暂的星尘。'],
    ['star-travel-trunk', '星空旅行箱', 75, '奇物', '旅行箱', '一只收藏着夜空的古老旅行箱。', '打开箱盖，里面是一片有云缓缓飘过的夜空。'],
    ['golden-bird', '金羽小鸟', 300, '伙伴', '小鸟', '独立出售的金羽小伙伴，会停在窗边。', '窗边歪头、梳羽；点它会绕房间飞一圈。'],
    ['wizard-cat', '巫师猫', 1000, '伙伴', '猫咪', '独立出售的小屋伙伴，不需要购买其他家具。', '打盹、摇尾巴、伸懒腰，偶尔走到孩子眼前。'],
  ];
  // Literal paths let the offline builder embed the same artwork in one file.
  const atlases = ['assets/shop/furniture-atlas.webp', 'assets/shop/room-atlas.webp',
    'assets/shop/curios-atlas.webp', 'assets/shop/companions-atlas.webp'];
  const items = Object.freeze(rows.map((row, index) => Object.freeze({
    id: row[0], name: row[1], price: row[2], category: row[3], slot: row[4],
    description: row[5], effect: row[6], magic: row[6], artIndex: index,
    art: Object.freeze({ src: atlases[Math.floor(index / 6)], col: index % 2, row: Math.floor(index % 6 / 2) }),
  })));
  const byId = Object.freeze(Object.fromEntries(items.map(item => [item.id, item])));
  root.HanziMagicShopCatalog = Object.freeze({ items, byId, get: id => Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null });
})(typeof window !== 'undefined' ? window : globalThis);
