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

  // Exact-word additions for familiar parent-entered prompts. These do not add
  // automatic defaults for bare characters, names, or unknown place names.
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

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function reading(value) {
    return text(value).normalize('NFC').toLowerCase().replace(/[\s·•]/g, '');
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
        if (Array.from(char).length !== 1) return null;
        word = word.split('_').join(char);
      }
      if (char && !word.includes(char)) return null;
      return sentences[word] || null;
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
