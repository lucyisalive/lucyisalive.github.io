(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziSentenceHints = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // These are original example sentences, not quotations from the textbook.
  // The first 92 targets match data/grade3-targets.tsv. Keep the complete word as
  // the lookup key: a parent's new word must never inherit another word's hint.
  const textbook = [
    ['匕', 'bǐ', '匕首', '博物馆里有一把古代的匕首。'],
    ['乙', 'yǐ', '乙方', '合同上写着甲方和乙方的名字。'],
    ['犬', 'quǎn', '军犬', '军犬跟着战士一起训练。'],
    ['长', 'cháng', '冗长', '这个故事太冗长，讲了很久还没结束。'],
    ['止', 'zhǐ', '停止', '红灯亮了，汽车停止了前进。'],
    ['土', 'tǔ', '泥土', '小种子在松软的泥土里发芽了。'],
    ['夕', 'xī', '夕阳', '傍晚，夕阳把天空染成了红色。'],
    ['目', 'mù', '目送', '我站在门口，目送奶奶离开。'],
    ['牛', 'niú', '牛奶', '早餐时，我喝了一杯温热的牛奶。'],
    ['互', 'hù', '互相', '同学之间应该互相帮助。'],
    ['甘', 'gān', '甘心', '比赛输了，他不甘心，决定再练一练。'],
    ['生', 'shēng', '生命', '小草也有生命，需要阳光和水。'],
    ['刀', 'dāo', '剪刀', '我用剪刀把彩纸剪成一朵花。'],
    ['且', 'qiě', '而且', '这个苹果又大又甜，而且很新鲜。'],
    ['才', 'cái', '才干', '班长很有才干，能把活动安排好。'],
    ['本', 'běn', '本来', '我本来想去踢球，后来下雨了。'],
    ['头', 'tóu', '眉头', '遇到难题时，他皱起了眉头。'],
    ['子', 'zi', '李子', '树上的李子熟了，尝起来酸酸甜甜。'],
    ['认', 'rèn', '认识', '开学第一天，我认识了很多新同学。'],
    ['收', 'shōu', '收拾', '做完手工，我把桌面收拾干净。'],
    ['机', 'jī', '机会', '老师给了每个人上台表演的机会。'],
    ['幻', 'huàn', '变幻', '天空中云朵的形状不断变幻。'],
    ['记', 'jì', '记号', '我在日历上画了圆圈，作为记号。'],
    ['吸', 'xī', '呼吸', '运动以后，我停下来慢慢呼吸。'],
    ['纤', 'xiān', '纤细', '柳树垂下了许多纤细的枝条。'],
    ['精', 'jīng', '精美', '这张贺卡做得十分精美。'],
    ['验', 'yàn', '实验', '科学课上，我们做了种子发芽的实验。'],
    ['材', 'cái', '材料', '做纸船的材料是一张彩纸。'],
    ['价', 'jià', '价格', '买东西前，我先看看它的价格。'],
    ['便', 'pián', '便宜', '这支铅笔很便宜，只要一元钱。'],
    ['积', 'jī', '积累', '每天读几页书，慢慢积累知识。'],
    ['经', 'jīng', '经验', '奶奶有种菜的经验，知道什么时候浇水。'],
    ['担', 'dān', '担心', '小猫走丢了，我很担心它。'],
    ['确', 'què', '确定', '出门前，我们先确定见面的时间。'],
    ['秘', 'mì', '秘密', '礼物先藏起来，这是我们的秘密。'],
    ['粉', 'fěn', '粉红', '小妹妹穿着一条粉红色的裙子。'],
    ['惜', 'xī', '可惜', '气球飞走了，我觉得很可惜。'],
    ['仰', 'yǎng', '仰望', '夜晚，我们抬起头，仰望满天星星。'],
    ['锋', 'fēng', '锋利', '这把剪刀很锋利，剪纸很轻松。'],
    ['融', 'róng', '融化', '太阳出来了，雪人慢慢融化了。'],
    ['咳', 'ké', '咳嗽', '弟弟感冒了，夜里一直咳嗽。'],
    ['诉', 'sù', '诉说', '小明向妈妈诉说今天在学校的趣事。'],
    ['讽', 'fěng', '讽刺', '这幅漫画在讽刺乱扔垃圾的人。'],
    ['顾', 'gù', '顾客', '店员热情地招呼进店的顾客。'],
    ['袖', 'xiù', '袖子', '洗手前，先把袖子卷起来。'],
    ['衬', 'chèn', '衬衫', '爸爸穿着白衬衫去上班。'],
    ['形', 'xíng', '形式', '这次比赛采用小组接力的形式。'],
    ['性', 'xìng', '性子', '妹妹性子急，做事总想快一点。'],
    ['静', 'jìng', '平静', '风停了，湖面又恢复了平静。'],
    ['明', 'míng', '文明', '排队上车，是文明的行为。'],
    ['称', 'chèn', '匀称', '这只花瓶的形状很匀称。'],
    ['颜', 'yán', '颜色', '彩虹有好几种美丽的颜色。'],
    ['瞭', 'liào', '瞭望', '船员站在高处，向远方瞭望。'],
    ['锚', 'máo', '铁锚', '大船停下后，水手把铁锚放进水里。'],
    ['姿', 'zī', '姿势', '写字时，要保持正确的姿势。'],
    ['花', 'huā', '荷花', '夏天，池塘里的荷花开了。'],
    ['尘', 'chén', '尘土', '汽车开过，扬起了一阵尘土。'],
    ['前', 'qián', '提前', '上学时，我总会提前几分钟到教室。'],
    ['念', 'niàn', '想念', '奶奶回老家了，我很想念她。'],
    ['意', 'yì', '满意', '这次作业写得认真，老师很满意。'],
    ['奇', 'qí', '奇异', '海底生活着许多外形奇异的动物。'],
    ['奖', 'jiǎng', '夸奖', '我帮妈妈洗碗，妈妈夸奖了我。'],
    ['密', 'mì', '浓密', '大树的叶子十分浓密，遮住了阳光。'],
    ['害', 'hai', '厉害', '姐姐跑步很厉害，总是第一个到终点。'],
    ['愁', 'chóu', '发愁', '作业本找不到了，我正在发愁。'],
    ['景', 'jǐng', '景物', '我把窗外的景物画在纸上。'],
    ['类', 'lèi', '种类', '图书馆里的书有很多种类。'],
    ['贵', 'guì', '宝贵', '时间很宝贵，我们要好好利用。'],
    ['爱', 'ài', '爱好', '我的爱好是画画和踢球。'],
    ['芒', 'máng', '光芒', '太阳升起来，放出金色的光芒。'],
    ['善', 'shàn', '善良', '奶奶很善良，经常照顾流浪的小猫。'],
    ['忠', 'zhōng', '忠诚', '这只小狗一直守护主人，十分忠诚。'],
    ['笑', 'xiào', '笑话', '爸爸讲了一个笑话，逗得大家哈哈大笑。'],
    ['声', 'shēng', '名声', '这位医生帮助过很多人，留下了好名声。'],
    ['闲', 'xián', '闲散', '爷爷闲散地坐在院子里晒太阳。'],
    ['逃', 'táo', '逃生', '演习时，老师教我们从楼梯有序逃生。'],
    ['退', 'tuì', '后退', '汽车要开过来了，请往后退一步。'],
    ['逆', 'nì', '逆风', '小鸟逆风飞行，翅膀不停地扇动。'],
    ['迷', 'mí', '迷失', '大雾里，他在树林中迷失了方向。'],
    ['网', 'wǎng', '网球', '爸爸在球场上教我打网球。'],
    ['病', 'bìng', '养病', '爷爷感冒了，正在家里休息养病。'],
    ['闷', 'mèn', '沉闷', '夏天的午后，空气沉闷，一丝风也没有。'],
    ['威', 'wēi', '威武', '站岗的战士身穿军装，看起来很威武。'],
    ['建', 'jiàn', '建造', '工人们正在河上建造一座新桥。'],
    ['巡', 'xún', '巡航', '海警船正在海上巡航。'],
    ['历', 'lì', '历史', '我们参观博物馆，了解家乡的历史。'],
    ['园', 'yuán', '公园', '我们去公园放风筝。'],
    ['圆', 'yuán', '圆润', '鹅卵石被河水磨得圆润光滑。'],
    ['固', 'gù', '坚固', '这座石桥很坚固，汽车也能从上面开过。'],
    ['微', 'wēi', '微风', '微风吹过，树叶轻轻摇。'],
    ['辩', 'biàn', '辩论', '大家分成两组，辩论哪种办法更好。'],
    ['燕', 'yàn', '燕子', '春天到了，燕子飞回屋檐下筑巢。'],
  ];

  // Earlier built-in practice targets remain useful for saved progress. A word
  // can be a default for more than one tested character (宽阔: 宽 or 阔).
  const earlier = [
    ['宽', 'kuān', '宽阔', '广场很宽阔，能让许多人一起活动。'],
    ['阔', 'kuò', '宽阔'],
    ['横', 'héng', '横卧', '一座石桥横卧在小河上。'],
    ['卧', 'wò', '横卧'],
    ['隐', 'yǐn', '若隐若现', '远处的山峰在雾中若隐若现。'],
    ['鼎', 'dǐng', '人声鼎沸', '操场上人声鼎沸，大家都在为比赛加油。'],
    ['昂', 'áng', '昂首', '小公鸡昂首挺胸地走过院子。'],
    ['东', 'dōng', '向东望', '我们站在山顶向东望，等着太阳升起。'],
    ['据', 'jù', '据说', '据说今晚能看见流星，大家都很期待。'],
    ['霎', 'shà', '霎时', '一阵大风吹来，霎时乌云满天。'],
    ['渐', 'jiàn', '逐渐', '春天到了，天气逐渐暖和起来。'],
    ['裂', 'liè', '山崩地裂', '潮水奔来，发出山崩地裂般的响声。'],
    ['随', 'suí', '随便', '博物馆里的展品不能随便触摸。'],
    ['便', 'biàn', '随便'],
    ['薄', 'bó', '薄雾', '清晨，湖面上飘着一层薄雾。'],
    ['嘴', 'zuǐ', '嘴巴', '小兔子吃着草，嘴巴一动一动的。'],
    ['藏', 'cáng', '躲藏', '小猫躲藏在沙发后面，我们找了很久。'],
    ['熟', 'shú', '成熟', '秋天到了，果园里的苹果成熟了。'],
    ['蝴', 'hú', '蝴蝶', '一只蝴蝶在花丛中飞来飞去。'],
    ['器', 'qì', '机器', '这台机器能把稻谷变成大米。'],
    ['燃', 'rán', '燃烧', '木柴在炉子里燃烧，火苗不停地跳动。'],
    ['澡', 'zǎo', '洗澡', '运动后出了汗，我回家洗澡。'],
    ['慧', 'huì', '智慧', '乌鸦用自己的智慧喝到了瓶里的水。'],
    ['融', 'róng', '融化'],
    ['摔', 'shuāi', '摔倒', '地上很滑，弟弟一不小心摔倒了。'],
    ['警', 'jǐng', '警察', '警察站在路口，指挥车辆通行。'],
  ];

  // Exact-word additions for familiar parent-entered prompts. They are not
  // bare-character defaults: the parent chose the full word and its context.
  const additional = {
    '奇迹': '这棵小树在石缝里长大，真是个奇迹。',
    '求救': '有人落水了，他大声呼喊着求救。',
    '师弟': '师弟刚来学武，师兄耐心地教他。',
    '花园': '我们家的花园里，玫瑰开得正好。',
    '公元': '公元二〇〇八年，北京举办了奥运会。',
    '威风': '那只大公鸡昂着头，走起路来真威风。',
    '太阳': '太阳升起来，照亮了大地。',
    '月亮': '夜晚，月亮挂在天空中。',
    '星星': '晴朗的夜空中，有许多明亮的星星。',
    '天空': '雨过天晴，天空中出现了彩虹。',
    '学校': '每天早晨，我背着书包去学校。',
    '老师': '老师正在教我们读一首古诗。',
    '同学': '放学后，我和同学一起打篮球。',
    '朋友': '我和朋友约好，周末一起看书。',
    '快乐': '大家一起唱歌，度过了快乐的一天。',
    '开心': '收到朋友的贺卡，我特别开心。',
    '爸爸': '爸爸陪我在小区里骑自行车。',
    '妈妈': '妈妈和我一起做了一顿晚饭。',
    '爷爷': '爷爷教我在阳台上种蔬菜。',
    '奶奶': '奶奶坐在树下，给我讲小时候的故事。',
    '小猫': '小猫伸了一个懒腰，又睡着了。',
    '小狗': '小狗叼着皮球，跑到我身边。',
  };

  // Concrete contexts for likely additions, including spellings that sound
  // alike. These entries are original; matching never uses sound or a substring.
  const contextual = {
    '秘密基地': '我们把树下的小木屋当作秘密基地。',
    '园艺': '爷爷喜欢园艺，常在院子里种花。',
    '小明': '小明把落在地上的书捡了起来。',
    '杭州': '我们去杭州游玩，在西湖边散步。',
    '原来': '我找了半天，原来钥匙就在口袋里。',
    '原野': '春天到了，原野上长满了野花。',
    '圆形': '我用圆规在纸上画了一个圆形。',
    '飞翔': '海鸥张开翅膀，在海面上飞翔。',
    '飞行': '飞机在云层上方平稳地飞行。',
    '顿时': '比赛一结束，场边顿时响起了掌声。',
    '一顿': '奶奶给我们做了一顿热腾腾的饭。',
    '渐渐': '雨渐渐小了，我们收起了雨伞。',
    '随手': '出门时，我随手关上了灯。',
    '跟随': '小鸭子跟随妈妈游过池塘。',
    '谈话': '老师和我谈话，问我最近读了什么书。',
    '交谈': '他们坐在长椅上，轻声交谈。',
    '熟悉': '走进小区，我看见了熟悉的大树。',
    '熟练': '她练了许多遍，现在能熟练地系鞋带。',
    '分辨': '闭上眼睛，我也能分辨这两种声音。',
    '辨认': '天色很暗，我费了些劲才辨认出路牌。',
    '辩解': '他没有为自己的错误辩解，主动道了歉。',
    '分辩': '他急忙分辩，说杯子不是他打碎的。',
    '纪念': '我们种下一棵树，纪念这次难忘的旅行。',
    '记忆': '小时候在海边拾贝壳的事，留在我的记忆里。',
    '权利': '每个孩子都有接受教育的权利。',
    '权力': '值日班长有安排值日工作的权力。',
    '反应': '哨声一响，他反应很快，立刻跑了出去。',
    '反映': '同学们向老师反映了水龙头漏水的问题。',
    '考查': '老师用几道小题考查大家学得怎么样。',
    '考察': '科学家到河边考察水里的动植物。',
    '必须': '过马路时，我们必须看清交通信号灯。',
    '必需': '阳光和水是许多植物生长所必需的。',
    '启示': '蚂蚁合力搬食物，给了我团结合作的启示。',
    '启事': '我丢了帽子，就在公告栏贴了一张寻物启事。',
    '工夫': '我花了一下午的工夫，才拼好这幅图。',
    '功夫': '他练了多年的功夫，一招一式都很稳。',
    '报到': '新学期第一天，我们到学校报到。',
    '报道': '校园小记者报道了这场接力赛。',
    '熔化': '炉子里的铜受热后熔化，变成了液体。',
    '溶化': '我搅了搅杯子，白糖很快就在水里溶化了。',
    '似乎': '乌云越来越厚，似乎快要下雨了。',
    '诚实': '他诚实地说，是自己不小心碰倒了花瓶。',
    '耐心': '妈妈耐心地教我，一步一步折纸船。',
    '勇气': '她鼓起勇气，走上讲台给大家讲故事。',
    '辽阔': '草原十分辽阔，一眼望不到边。',
    '翱翔': '雄鹰张开翅膀，在蓝天上翱翔。',
    '涟漪': '一滴雨落进水塘，荡开一圈小小的涟漪。',
    '静谧': '夜深了，静谧的山村里只听得见虫鸣。',
    '蜿蜒': '一条小路沿着山坡蜿蜒而上。',
    '清澈': '溪水很清澈，能看见水底的石子。',
    '澄澈': '湖水澄澈，倒映着蓝天和白云。',
    '潺潺': '小溪潺潺地流过树林。',
    '嶙峋': '山顶怪石嶙峋，有的像蹲着的狮子。',
    '潋滟': '太阳照着湖面，水波潋滟，闪闪发亮。',
    '氤氲': '山间云雾氤氲，远处的树林若隐若现。',
    '葱茏': '山坡上草木葱茏，满眼都是绿。',
    '罅隙': '一线阳光从石墙的罅隙里照进来。',
    '蹒跚': '刚学会走路的宝宝蹒跚地走向妈妈。',
    '踟蹰': '他在门口踟蹰了一会儿，才鼓起勇气进去。',
    '徜徉': '我们在花海里徜徉，边走边欣赏。',
    '邂逅': '我在街角的书店邂逅了许久不见的朋友。',
    '趔趄': '他绊了一下，打了个趔趄，差点摔倒。',
    '缄默': '大家都在发言，他却一直缄默，没有开口。',
    '窸窸窣窣': '草丛里窸窸窣窣，原来是小猫钻了过去。',
    '鳞次栉比': '街道两旁高楼鳞次栉比，一栋挨着一栋。',
    '戛然而止': '门一开，屋里的笑声戛然而止。',
    '震耳欲聋': '雷声震耳欲聋，吓得小狗钻进了桌底。',
    '漫天卷地': '沙尘漫天卷地，连远处的房子都看不清了。',
    '鸦雀无声': '电影开始了，原本热闹的大厅顿时鸦雀无声。',
    '囫囵吞枣': '读故事不能囫囵吞枣，要慢慢想清楚情节。',
  };

  // Only words explicitly assigned to one of these groups use its template.
  // An unknown suffix never makes a term a food, place, action, or name.
  const groups = [
    ['苹果 橘子 橙子 梨子 草莓 葡萄 香蕉 芒果 菠萝 桃子 樱桃 西瓜 柚子 山楂 桑葚 杨梅 猕猴桃 石榴 枇杷 柿子 荔枝 龙眼',
      word => `水果盘里放着新鲜的${word}。`],
    ['图书馆 阅览室 书店', word => `我在${word}里找到了一本想读的书。`],
    ['博物馆 科技馆 美术馆 展览馆', word => `我们跟着老师参观了${word}。`],
    ['跳绳 踢毽子 打篮球 打排球 打羽毛球 打乒乓球 踢足球', word => `放学后，我和朋友一起${word}。`],
    ['公交车 地铁 火车 高铁', word => `我们坐${word}去了城里的博物馆。`],
    ['刮风 下雨 下雪 打雷', word => `傍晚，外面${word}了。`],
    ['闷热 凉爽 暖和 寒冷 潮湿', word => `今天的天气很${word}。`],
  ];

  const sentences = Object.create(null);
  const defaults = Object.create(null);
  for (const entry of textbook.concat(earlier)) {
    const [char, pinyin, word, sentence] = entry;
    if (sentence) sentences[word] = sentence;
    if (!defaults[char]) defaults[char] = [];
    if (!defaults[char].some(candidate => candidate.word === word && candidate.pinyin === pinyin)) {
      defaults[char].push({ word, pinyin });
    }
  }
  Object.assign(sentences, additional);
  for (const [word, sentence] of Object.entries(contextual)) {
    if (!sentences[word]) sentences[word] = sentence;
  }
  for (const [words, example] of groups) {
    for (const word of words.split(' ')) {
      if (!sentences[word]) sentences[word] = example(word);
    }
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function reading(value) {
    return text(value).normalize('NFC').toLowerCase().replace(/[\s·•]/g, '');
  }

  function isHan(char) {
    const code = char.codePointAt(0);
    return code === 0x3007 || code === 0x3005 ||
      (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && code <= 0x323af);
  }

  // A neutral mention is a real short sentence even for a term we cannot
  // classify. It uses the exact spelling and does not invent a definition,
  // pronunciation, identity, or an interchangeable homophone.
  const mentions = [
    word => `我把“${word}”写进了词语本。`,
    word => `我在书上读到了“${word}”。`,
    word => `老师请我们用“${word}”造句。`,
  ];
  function generated(word) {
    if (word.length > 48) return null;
    const chars = Array.from(word);
    if (chars.length > 24 || !chars.some(isHan) ||
        !chars.every(char => isHan(char) || /^[A-Za-z0-9·・-]$/.test(char))) return null;
    let index = 0;
    for (const char of chars) index = (index * 31 + char.codePointAt(0)) >>> 0;
    return mentions[index % mentions.length](word);
  }

  // Return speech text only. The caller decides when to speak it; this module
  // has no UI, audio, or storage access and never changes the supplied item.
  function get(item) {
    if (!item || typeof item !== 'object') return null;
    const custom = text(item.sentence);
    if (custom) return custom;

    const char = text(item.char);
    let word = text(item.word);
    if (word) {
      // Old saved prompts may contain a blank in place of the tested character.
      if (word.includes('_')) {
        if (Array.from(char).length !== 1 || !isHan(char) || word.indexOf('_') !== word.lastIndexOf('_')) return null;
        word = word.replace('_', char);
      }
      if (char && (Array.from(char).length !== 1 || !isHan(char) || !word.includes(char))) return null;
      return sentences[word] || generated(word);
    }

    // A bare character may use a reviewed default only when it is unambiguous
    // for the requested reading. For example 便 biàn must not use 便宜 pián.
    const requestedReading = reading(item.pinyin);
    const candidates = (defaults[char] || []).filter(candidate =>
      !requestedReading || candidate.pinyin === requestedReading);
    return candidates.length === 1 ? sentences[candidates[0].word] || null : null;
  }

  return Object.freeze({ get });
});
