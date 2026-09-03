// 5 只囚犯的种子数据。demo 期即使 mock 服务挂掉，页面也用它渲染，
// 交互（喂食/放风/陪玩）直接在本地数据上跑通。
//
// 字段约定：
//   id          囚犯编号（作为 navigateTo 路由参数）
//   name        姓名 / nickname 外号
//   species     物种  emoji 头像
//   mbti        性格（MBTI）
//   number      编号展示（橙色高亮字段）
//   numberMeaning 编号寓意
//   birthday    生日（MM-DD）  zodiac 星座
//   crime       罪名（黑色幽默）
//   introduction 介绍
//   cell        牢房名  floor 楼层
//   satisfaction 满意度 0-100  mood 心情词  kd 战绩
//   interactions 今日剩余互动次数（喂食2/放风1/陪玩3），feed.window 为当前是否可喂食
//   corpus      角色语料池（互动结果时按口吻返回一句）
const { feedWindowOpen } = require('./feedWindow');

const ANIMALS = [
  {
    id: '1024',
    name: '瑞克',
    nickname: '卷王',
    species: '仓鼠',
    emoji: '🐹',
    mbti: 'ENTJ',
    number: '#1024',
    numberMeaning: '二叉树战神：1024 代表全天候全勤打卡',
    birthday: '10-24',
    zodiac: '天蝎座',
    crime: '深夜在牢房里内卷加班，带坏作息',
    introduction: '隔壁牢房的模范囚犯。把监狱当成第二办公室，熟练背诵《监狱作息管理手册》。',
    cell: '牢房 1024',
    floor: '3F',
    satisfaction: 88,
    mood: '得意',
    kd: '12 / 3',
    interactions: { feed: 2, walk: 1, play: 3, feedWindow: true },
    corpus: [
      '打卡了，领导。',
      '今天也不歇，卷起来。',
      '报告，我把自己叠成一只纸鹤准备下工。',
    ],
  },
  {
    id: '1001',
    name: '切达',
    nickname: '奶酪暴君',
    species: '老鼠',
    emoji: '🐭',
    mbti: 'ESTJ',
    number: '#1001',
    numberMeaning: '万物归一：1001% 的独占欲',
    birthday: '10-01',
    zodiac: '天秤座',
    crime: '霸占牢房最后一格奶酪，拒不分享',
    introduction: '监狱仓库的隐形产权人。你以为自己拥有一切，其实奶酪都是他的。',
    cell: '牢房 1001',
    floor: '1F',
    satisfaction: 72,
    mood: '满足',
    kd: '8 / 2',
    interactions: { feed: 2, walk: 1, play: 3, feedWindow: true },
    corpus: [
      '这块奶酪，我登记过了。',
      '看守同志，库存告急，麻烦补货。',
      '我的领地，闲人免进。',
    ],
  },
  {
    id: '0707',
    name: '皮皮兔',
    nickname: '越狱第七次',
    species: '兔子',
    emoji: '🐰',
    mbti: 'ENFP',
    number: '#0707',
    numberMeaning: '007 越狱小队：专挑看守打盹的时辰行动',
    birthday: '07-07',
    zodiac: '巨蟹座',
    crime: '第七次越狱未遂——这次是被菜刀盯上了',
    introduction: '监狱里的气氛组。别信他那双无辜的大眼睛，他数着日子等第八次越狱。',
    cell: '牢房 0707',
    floor: '-1F',
    satisfaction: 60,
    mood: '亢奋',
    kd: '一度在外潇洒 3 天',
    interactions: { feed: 2, walk: 1, play: 3, feedWindow: true },
    corpus: [
      '这次我真的有计划了！',
      '老规矩，翻墙记得叫我。',
      '菜还没上？我可要行动了。',
    ],
  },
  {
    id: '0001',
    name: '阿冷',
    nickname: '冰山一哥',
    species: '企鹅',
    emoji: '🐧',
    mbti: 'ISTP',
    number: '#0001',
    numberMeaning: '监狱第一号档案：眼神比看守还冷',
    birthday: '01-19',
    zodiac: '摩羯座',
    crime: '在食堂门口无证摆摊卖冰棍',
    introduction: '寡言少语，拒收所有暖场。他的世界里只有冰和更冰。',
    cell: '牢房 0001',
    floor: '2F',
    satisfaction: 45,
    mood: '高冷',
    kd: '0 / 0（不屑参战）',
    interactions: { feed: 2, walk: 1, play: 3, feedWindow: true },
    corpus: [
      '……',
      '冷。别聊。',
      '有冰吗？没有就散。',
    ],
  },
  {
    id: '0520',
    name: '汪汪',
    nickname: '编外门卫',
    species: '狗',
    emoji: '🐶',
    mbti: 'ESFJ',
    number: '#0520',
    numberMeaning: '520 被收养纪念日：汪汪队编外人员',
    birthday: '05-20',
    zodiac: '金牛座',
    crime: '无证看大门——无证上岗，知法犯法',
    introduction: '自来熟，见谁都摇尾巴。最大的梦想是把看守也拐进自己家。',
    cell: '牢房 0520',
    floor: 'G',
    satisfaction: 80,
    mood: '热情',
    kd: '每天都在上岗',
    interactions: { feed: 2, walk: 1, play: 3, feedWindow: true },
    corpus: [
      '汪！今天也看大门！',
      '带根骨头来就行，朋友。',
      '谁是镇上最靓的仔？是我！',
    ],
  },
];

function getAll() {
  return ANIMALS;
}

function getById(id) {
  return ANIMALS.find((a) => a.id === String(id)) || ANIMALS[0];
}

function getFeedWindow(id) {
  const a = getById(id);
  return {
    window: feedWindowOpen(),
    // 若当前不在饭点，喂食次数不计入可用（展示非时段变灰）。
    available: !!a.interactions.feedWindow && feedWindowOpen(),
  };
}

module.exports = { ANIMALS, getAll, getById, getFeedWindow };
