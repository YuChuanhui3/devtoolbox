import { randomUserAgent } from './uagen';

export type RandomFn = () => number;

const pick = <T>(arr: readonly T[], random: RandomFn): T => arr[Math.floor(random() * arr.length)];
const randInt = (min: number, max: number, random: RandomFn): number => min + Math.floor(random() * (max - min + 1));
const digitString = (length: number, random: RandomFn): string =>
  Array.from({ length }, () => randInt(0, 9, random)).join('');

export const luhnCheck = (value: string): boolean => {
  let sum = 0;
  let alternate = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char < '0' || char > '9') return false;
    let digit = Number(char);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
};

const appendLuhn = (partial: string): string => {
  let sum = 0;
  let alternate = true;
  for (let index = partial.length - 1; index >= 0; index -= 1) {
    let digit = Number(partial[index]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return partial + String((10 - (sum % 10)) % 10);
};

/* ---------------- 中国大陆测试数据 ---------------- */

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '郑', '梁', '谢', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾'];
const MALE_NAMES = ['伟', '强', '磊', '军', '洋', '勇', '峰', '超', '涛', '明', '杰', '浩', '凯', '健', '俊', '鹏', '飞', '龙', '建华', '志强', '国栋', '文博', '宇轩', '浩然', '子轩', '嘉豪', '泽宇', '锦程'];
const FEMALE_NAMES = ['芳', '娜', '敏', '静', '丽', '艳', '娟', '霞', '秀英', '桂英', '玉梅', '婷', '雪', '琳', '玲', '梅', '欣怡', '雨桐', '梦琪', '诗涵', '思琪', '雅雯', '语嫣', '若楠', '婉婷', '晓芸'];

const AREA_CODES = ['110101', '120101', '130102', '140105', '150102', '210102', '220102', '230102', '310101', '320102', '330102', '340102', '350102', '360102', '370102', '410102', '420102', '430102', '440103', '450102', '460102', '500101', '510102', '520102', '530102', '540102', '610102', '620102', '630102', '640102', '650102'];

const MOBILE_PREFIXES = ['133', '135', '136', '137', '138', '139', '150', '151', '152', '153', '155', '156', '157', '158', '159', '166', '170', '171', '175', '176', '177', '178', '180', '181', '182', '183', '185', '186', '187', '188', '189', '191', '198', '199'];

export interface CnBank {
  zh: string;
  en: string;
  prefix: string;
  length: number;
}

/** 常见银联借记卡 BIN 段，仅用于生成校验位合法的测试卡号。 */
export const CN_BANKS: CnBank[] = [
  { zh: '工商银行', en: 'ICBC', prefix: '622202', length: 19 },
  { zh: '建设银行', en: 'CCB', prefix: '621700', length: 19 },
  { zh: '农业银行', en: 'ABC', prefix: '622848', length: 19 },
  { zh: '中国银行', en: 'BOC', prefix: '621660', length: 19 },
  { zh: '交通银行', en: 'BOCOM', prefix: '622260', length: 19 },
  { zh: '招商银行', en: 'CMB', prefix: '621483', length: 19 },
  { zh: '邮政储蓄银行', en: 'PSBC', prefix: '621095', length: 19 },
  { zh: '中信银行', en: 'CITIC', prefix: '622678', length: 19 },
  { zh: '浦发银行', en: 'SPDB', prefix: '622521', length: 19 },
  { zh: '兴业银行', en: 'CIB', prefix: '622901', length: 19 },
];

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK_CODES = '10X98765432';

export const cnIdCheckDigit = (first17: string): string => {
  const sum = first17.split('').reduce((acc, char, index) => acc + Number(char) * ID_WEIGHTS[index], 0);
  return ID_CHECK_CODES[sum % 11];
};

const cnName = (male: boolean, random: RandomFn): string =>
  pick(SURNAMES, random) + pick(male ? MALE_NAMES : FEMALE_NAMES, random);

export const generateCnIdCard = (male: boolean, random: RandomFn): string => {
  const area = pick(AREA_CODES, random);
  const year = randInt(1950, 2006, random);
  const month = randInt(1, 12, random);
  const day = randInt(1, 28, random);
  const seqBase = digitString(2, random);
  const genderDigit = male ? pick(['1', '3', '5', '7', '9'], random) : pick(['0', '2', '4', '6', '8'], random);
  const first17 = `${area}${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${seqBase}${genderDigit}`;
  return first17 + cnIdCheckDigit(first17);
};

export const generateCnMobile = (random: RandomFn): string => pick(MOBILE_PREFIXES, random) + digitString(8, random);

export const generateCnDebitCard = (bank: CnBank, random: RandomFn): string =>
  appendLuhn(bank.prefix + digitString(bank.length - bank.prefix.length - 1, random));

export interface CnTestProfile {
  name: string;
  gender: '男' | '女';
  phone: string;
  idCard: string;
  bank: CnBank;
  cardNumber: string;
}

export const generateCnProfiles = (count: number, random: RandomFn = Math.random): CnTestProfile[] =>
  Array.from({ length: count }, () => {
    const male = random() < 0.5;
    const bank = pick(CN_BANKS, random);
    return {
      name: cnName(male, random),
      gender: male ? ('男' as const) : ('女' as const),
      phone: generateCnMobile(random),
      idCard: generateCnIdCard(male, random),
      bank,
      cardNumber: generateCnDebitCard(bank, random),
    };
  });

/* ---------------- 各国虚拟身份资料 ---------------- */

export type CountryCode = 'US' | 'UK' | 'CA' | 'AU' | 'JP' | 'DE' | 'CN';

export interface CountryMeta {
  code: CountryCode;
  zh: string;
  en: string;
}

export const FAKER_COUNTRIES: CountryMeta[] = [
  { code: 'US', zh: '美国', en: 'United States' },
  { code: 'UK', zh: '英国', en: 'United Kingdom' },
  { code: 'CA', zh: '加拿大', en: 'Canada' },
  { code: 'AU', zh: '澳大利亚', en: 'Australia' },
  { code: 'JP', zh: '日本', en: 'Japan' },
  { code: 'DE', zh: '德国', en: 'Germany' },
  { code: 'CN', zh: '中国', en: 'China' },
];

const EN_MALE = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon'];
const EN_FEMALE = ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Carol', 'Amanda', 'Dorothy', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura', 'Cynthia', 'Kathleen', 'Amy', 'Shirley', 'Angela', 'Helen', 'Anna', 'Brenda', 'Pamela', 'Nicole', 'Emma'];
const EN_LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Phillips'];
const EN_STREETS = ['Main St', 'Oak Ave', 'Maple St', 'Cedar Ln', 'Pine Rd', 'Elm St', 'Washington Ave', 'Lake St', 'Hill Rd', 'Park Ave', 'Sunset Blvd', 'Broadway', '2nd St', '3rd Ave', 'Highland Ave', 'Valley Rd', 'Meadow Ln', 'Forest Ave', 'River Rd', 'Spring St', 'Church St', 'School Rd', 'Mill Ln', 'North St', 'South Ave'];
const EN_HAIR = ['Black', 'Brown', 'Blond', 'Red', 'Gray', 'White'];
const EN_OCCUPATIONS = ['Web Administrator', 'Molding Technician', 'Accountant', 'Registered Nurse', 'Software Engineer', 'Marketing Specialist', 'Electrician', 'Sales Representative', 'Graphic Designer', 'Data Analyst', 'Project Manager', 'Logistics Coordinator', 'Dental Assistant', 'Real Estate Agent', 'Financial Advisor', 'Mechanical Engineer', 'Operations Supervisor', 'Content Writer', 'Customer Success Lead', 'Quality Inspector', 'Civil Engineer', 'Pharmacy Technician', 'HR Coordinator', 'Network Administrator'];
const EN_COMPANIES = ['Maxiserve', 'Northline Systems', 'Brightpath Labs', 'Vertexworks', 'Clearwater Digital', 'Ironclad Media', 'Summit Ridge Tech', 'Bluepeak Analytics', 'Foxglove Studio', 'Hearthstone Foods', 'Quantum Foundry', 'Silverpine Group', 'Oakmont Services', 'Windward Logistics', 'Copperfield Works', 'Lakeshore Partners'];
const EN_EMPLOYMENT = ['Full-time work', 'Part-time work', 'Self-employed', 'Contract work'];
const EN_EDUCATION = ["Associate and/or bachelor's degree", "Bachelor's degree", "Master's degree", 'High school diploma', 'Doctoral degree'];
const ADJECTIVES = ['silent', 'brave', 'lucky', 'quiet', 'swift', 'amber', 'crimson', 'gentle', 'hidden', 'jolly', 'keen', 'mellow', 'noble', 'rapid', 'sunny', 'tidy', 'urban', 'vivid', 'wild', 'zesty'];
const NOUNS = ['falcon', 'harbor', 'meadow', 'otter', 'pebble', 'quartz', 'river', 'summit', 'thistle', 'willow', 'zephyr', 'canyon', 'dune', 'ember', 'fern', 'glade', 'inlet', 'jetty', 'knoll', 'lagoon'];
const SECURITY_QUESTIONS = ['What was the name of your first pet?', 'What city were you born in?', 'What is your favorite book?', 'What was your childhood nickname?', 'What street did you grow up on?'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const OS_LIST = ['Windows 11', 'Windows 10', 'macOS Sonoma', 'Ubuntu 24.04', 'Android 15', 'iOS 18'];

const CURRENCY: Record<CountryCode, string> = {
  US: '$',
  CA: '$',
  AU: '$',
  UK: '£',
  DE: '€',
  JP: '¥',
  CN: '¥',
};

interface UsRegion { state: string; stateFull: string; city: string; zipPrefix: string; areaCode: string }
const US_REGIONS: UsRegion[] = [
  { state: 'WI', stateFull: 'Wisconsin', city: 'Milwaukee', zipPrefix: '532', areaCode: '414' },
  { state: 'CA', stateFull: 'California', city: 'Los Angeles', zipPrefix: '900', areaCode: '213' },
  { state: 'NY', stateFull: 'New York', city: 'Buffalo', zipPrefix: '142', areaCode: '716' },
  { state: 'TX', stateFull: 'Texas', city: 'Houston', zipPrefix: '770', areaCode: '713' },
  { state: 'FL', stateFull: 'Florida', city: 'Orlando', zipPrefix: '328', areaCode: '407' },
  { state: 'WA', stateFull: 'Washington', city: 'Seattle', zipPrefix: '981', areaCode: '206' },
  { state: 'IL', stateFull: 'Illinois', city: 'Chicago', zipPrefix: '606', areaCode: '312' },
  { state: 'MA', stateFull: 'Massachusetts', city: 'Boston', zipPrefix: '021', areaCode: '617' },
  { state: 'CO', stateFull: 'Colorado', city: 'Denver', zipPrefix: '802', areaCode: '303' },
  { state: 'GA', stateFull: 'Georgia', city: 'Atlanta', zipPrefix: '303', areaCode: '404' },
  { state: 'AZ', stateFull: 'Arizona', city: 'Phoenix', zipPrefix: '850', areaCode: '602' },
  { state: 'PA', stateFull: 'Pennsylvania', city: 'Philadelphia', zipPrefix: '191', areaCode: '215' },
  { state: 'NV', stateFull: 'Nevada', city: 'Las Vegas', zipPrefix: '891', areaCode: '702' },
  { state: 'OH', stateFull: 'Ohio', city: 'Columbus', zipPrefix: '432', areaCode: '614' },
  { state: 'MI', stateFull: 'Michigan', city: 'Detroit', zipPrefix: '482', areaCode: '313' },
];

interface UkRegion { city: string; county: string; postcodeArea: string }
const UK_REGIONS: UkRegion[] = [
  { city: 'Manchester', county: 'Greater Manchester', postcodeArea: 'M' },
  { city: 'Birmingham', county: 'West Midlands', postcodeArea: 'B' },
  { city: 'Leeds', county: 'West Yorkshire', postcodeArea: 'LS' },
  { city: 'Liverpool', county: 'Merseyside', postcodeArea: 'L' },
  { city: 'Bristol', county: 'Avon', postcodeArea: 'BS' },
  { city: 'Sheffield', county: 'South Yorkshire', postcodeArea: 'S' },
  { city: 'Newcastle upon Tyne', county: 'Tyne and Wear', postcodeArea: 'NE' },
  { city: 'Nottingham', county: 'Nottinghamshire', postcodeArea: 'NG' },
  { city: 'Cardiff', county: 'South Glamorgan', postcodeArea: 'CF' },
  { city: 'Glasgow', county: 'Lanarkshire', postcodeArea: 'G' },
];

interface CaRegion { province: string; provinceFull: string; city: string; postalFirst: string; areaCode: string }
const CA_REGIONS: CaRegion[] = [
  { province: 'ON', provinceFull: 'Ontario', city: 'Toronto', postalFirst: 'M5', areaCode: '416' },
  { province: 'ON', provinceFull: 'Ontario', city: 'Ottawa', postalFirst: 'K1', areaCode: '613' },
  { province: 'QC', provinceFull: 'Quebec', city: 'Montreal', postalFirst: 'H2', areaCode: '514' },
  { province: 'BC', provinceFull: 'British Columbia', city: 'Vancouver', postalFirst: 'V6', areaCode: '604' },
  { province: 'AB', provinceFull: 'Alberta', city: 'Calgary', postalFirst: 'T2', areaCode: '403' },
  { province: 'MB', provinceFull: 'Manitoba', city: 'Winnipeg', postalFirst: 'R3', areaCode: '204' },
];

interface AuRegion { state: string; stateFull: string; city: string; postcode: string; areaCode: string }
const AU_REGIONS: AuRegion[] = [
  { state: 'NSW', stateFull: 'New South Wales', city: 'Sydney', postcode: '2000', areaCode: '02' },
  { state: 'VIC', stateFull: 'Victoria', city: 'Melbourne', postcode: '3000', areaCode: '03' },
  { state: 'QLD', stateFull: 'Queensland', city: 'Brisbane', postcode: '4000', areaCode: '07' },
  { state: 'WA', stateFull: 'Western Australia', city: 'Perth', postcode: '6000', areaCode: '08' },
  { state: 'SA', stateFull: 'South Australia', city: 'Adelaide', postcode: '5000', areaCode: '08' },
  { state: 'TAS', stateFull: 'Tasmania', city: 'Hobart', postcode: '7000', areaCode: '03' },
];

interface JpRegion { pref: string; city: string; district: string; zip: string; areaCode: string }
const JP_REGIONS: JpRegion[] = [
  { pref: '東京都', city: '渋谷区', district: '道玄坂', zip: '150-0043', areaCode: '03' },
  { pref: '東京都', city: '新宿区', district: '西新宿', zip: '160-8485', areaCode: '03' },
  { pref: '大阪府', city: '大阪市北区', district: '梅田', zip: '530-0001', areaCode: '06' },
  { pref: '京都府', city: '京都市中京区', district: '烏丸御池', zip: '604-8580', areaCode: '075' },
  { pref: '愛知県', city: '名古屋市中村区', district: '名駅', zip: '450-8500', areaCode: '052' },
  { pref: '北海道', city: '札幌市中央区', district: '北一条西', zip: '060-8580', areaCode: '011' },
  { pref: '福岡県', city: '福岡市博多区', district: '博多駅前', zip: '812-0012', areaCode: '092' },
];

interface DeRegion { state: string; city: string; zipPrefix: string; areaCode: string }
const DE_REGIONS: DeRegion[] = [
  { state: 'Bayern', city: 'München', zipPrefix: '80', areaCode: '089' },
  { state: 'Berlin', city: 'Berlin', zipPrefix: '10', areaCode: '030' },
  { state: 'Hamburg', city: 'Hamburg', zipPrefix: '20', areaCode: '040' },
  { state: 'Hessen', city: 'Frankfurt am Main', zipPrefix: '60', areaCode: '069' },
  { state: 'Nordrhein-Westfalen', city: 'Köln', zipPrefix: '50', areaCode: '0221' },
  { state: 'Sachsen', city: 'Leipzig', zipPrefix: '04', areaCode: '0341' },
  { state: 'Baden-Württemberg', city: 'Stuttgart', zipPrefix: '70', areaCode: '0711' },
];

interface cnRegion { province: string; city: string; district: string; zipPrefix: string }
const CN_REGIONS: cnRegion[] = [
  { province: '北京市', city: '北京市', district: '朝阳区', zipPrefix: '1000' },
  { province: '上海市', city: '上海市', district: '浦东新区', zipPrefix: '2001' },
  { province: '广东省', city: '广州市', district: '天河区', zipPrefix: '5106' },
  { province: '广东省', city: '深圳市', district: '南山区', zipPrefix: '5180' },
  { province: '浙江省', city: '杭州市', district: '西湖区', zipPrefix: '3100' },
  { province: '江苏省', city: '南京市', district: '鼓楼区', zipPrefix: '2100' },
  { province: '四川省', city: '成都市', district: '武侯区', zipPrefix: '6100' },
  { province: '湖北省', city: '武汉市', district: '江汉区', zipPrefix: '4300' },
  { province: '山东省', city: '青岛市', district: '市南区', zipPrefix: '2660' },
  { province: '陕西省', city: '西安市', district: '雁塔区', zipPrefix: '7100' },
];

const CN_STREETS = ['中山路', '解放路', '人民路', '建设大道', '和平街', '花园路', '文化路', '科技园路', '滨江路', '长安街', '南京路', '虎门大道', '天府大道', '东湖路', '闽江路', '雁塔西路'];
const JP_FAMILY = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '松本', '井上', '木村', '林', '斎藤'];
const JP_GIVEN = ['翔', '蓮', '陽菜', '結菜', '大輝', '颯太', '美咲', '愛', '悠人', '葵', '湊', '凛'];
const JP_STREETS = ['旭町', '緑ヶ丘', '中央', '本町', '桜台', '天神', '松ヶ崎', '港南', '平野', '若葉'];
const JP_OCCUPATIONS = ['ウェブ管理者', '金型技術者', '会計士', '看護師', 'システムエンジニア', 'マーケター', '電気技師', '営業', 'グラフィックデザイナー', 'データアナリスト', 'プロジェクトマネージャー'];
const JP_COMPANIES = ['マキシサーブ', '北線システム', 'ブライトパス研究所', 'バーテックスワークス', 'クリアウォーター・デジタル', 'アイアンクラッド・メディア', 'サミットリッジ科技', 'ブルーピーク分析'];
const DE_FAMILY = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Braun'];
const DE_GIVEN_M = ['Lukas', 'Leon', 'Maximilian', 'Felix', 'Jonas', 'Elias', 'Paul', 'Anton', 'Tim', 'Hendrik'];
const DE_GIVEN_F = ['Emma', 'Mia', 'Hannah', 'Sophia', 'Lena', 'Marie', 'Anna', 'Lea', 'Johanna', 'Frieda'];
const DE_STREETS = ['Hauptstraße', 'Dorfstraße', 'Gartenstraße', 'Schulstraße', 'Ringstraße', 'Bergstraße', 'Kirchstraße', 'Lindenstraße', 'Goethestraße', 'Schillerstraße', 'Marktstraße', 'Mühlenweg'];
const DE_OCCUPATIONS = ['Webadministrator', 'Formtechniker', 'Buchhalter', 'Krankenpfleger', 'Softwareentwickler', 'Marketingfachwirt', 'Elektriker', 'Vertriebsmitarbeiter', 'Grafikdesigner', 'Datenanalyst', 'Projektmanager'];
const DE_COMPANIES = ['Maxiserve GmbH', 'Nordlinie Systeme', 'Brightpfad Labor', 'Vertexwerk', 'Klarwasser Digital', 'Eisenkleid Medien', 'Gipfelgrat Technik', 'Blauspitze Analyse'];
const CN_OCCUPATIONS = ['网页管理员', '模具技师', '会计', '注册护士', '软件工程师', '市场专员', '电工', '销售代表', '平面设计师', '数据分析师', '项目经理', '物流协调员'];
const CN_COMPANIES = ['明泰资讯', '北线系统', '朗途实验室', '维仕科技', '澄水数码', '铁杉传媒', '峻岭科技', '青峰分析'];
const JP_HAIR = ['黒髪', '茶髪', '金髪', '銀髪'];
const DE_HAIR = ['Schwarz', 'Braun', 'Blond', 'Rot', 'Grau'];
const CN_HAIR = ['黑发', '棕发', '金发', '红发', '灰发'];

const cardSpecs = [
  { type: 'Visa', body: (random: RandomFn) => `4${digitString(14, random)}`, cvvLength: 3 },
  { type: 'MasterCard', body: (random: RandomFn) => `5${pick(['1', '2', '3', '4', '5'], random)}${digitString(13, random)}`, cvvLength: 3 },
  { type: 'American Express', body: (random: RandomFn) => `${pick(['34', '37'], random)}${digitString(12, random)}`, cvvLength: 4 },
  { type: 'Discover', body: (random: RandomFn) => `6011${digitString(11, random)}`, cvvLength: 3 },
];

const generateCard = (random: RandomFn) => {
  const spec = pick(cardSpecs, random);
  const now = new Date();
  const year = now.getFullYear() + randInt(2, 9, random);
  const month = randInt(1, 12, random);
  return {
    type: spec.type,
    number: appendLuhn(spec.body(random)),
    cvv: digitString(spec.cvvLength, random),
    expiry: `${String(month).padStart(2, '0')}/${year}`,
  };
};

const guid = (random: RandomFn): string => {
  const hex = (length: number) =>
    Array.from({ length }, () => '0123456789abcdef'[randInt(0, 15, random)]).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'], random)}${hex(3)}-${hex(12)}`;
};

const strongPassword = (random: RandomFn): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const chars = [upper[randInt(0, upper.length - 1, random)], String(randInt(2, 9, random)), lower[randInt(0, lower.length - 1, random)]];
  while (chars.length < 12) chars.push(pool[randInt(0, pool.length - 1, random)]);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const target = randInt(0, index, random);
    [chars[index], chars[target]] = [chars[target], chars[index]];
  }
  return chars.join('');
};

const emailLocal = (random: RandomFn): string =>
  Array.from({ length: randInt(8, 12, random) }, () => 'abcdefghijklmnopqrstuvwxyz'[randInt(0, 25, random)]).join('');

const slug = (random: RandomFn): string => pick(ADJECTIVES, random) + pick(NOUNS, random) + randInt(1, 99, random);

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export interface IdentityProfile {
  country: CountryCode;
  fullName: string;
  gender: string;
  title: string;
  birthday: string;
  hairColor: string;
  street: string;
  district: string;
  city: string;
  region: string;
  regionFull: string;
  postal: string;
  phone: string;
  email: string;
  cardType: string;
  cardNumber: string;
  cvv: string;
  cardExpiry: string;
  occupation: string;
  company: string;
  employment: string;
  monthlyIncome: string;
  nationalId: string;
  username: string;
  password: string;
  height: string;
  weight: string;
  bloodType: string;
  operatingSystem: string;
  guid: string;
  userAgent: string;
  education: string;
  website: string;
  securityQuestion: string;
  securityAnswer: string;
}

const englishAddress = (country: CountryCode, random: RandomFn) => {
  const streetNumber = randInt(100, 9999, random);
  const streetName = pick(EN_STREETS, random);
  if (country === 'US') {
    const region = pick(US_REGIONS, random);
    return {
      street: `${streetNumber}  ${streetName}`,
      district: '',
      city: region.city,
      region: region.state,
      regionFull: region.stateFull,
      postal: `${region.zipPrefix}${String(randInt(10, 99, random))}`,
      phone: `${region.areaCode}-${randInt(200, 999, random)}-${String(randInt(0, 9999, random)).padStart(4, '0')}`,
    };
  }
  if (country === 'UK') {
    const region = pick(UK_REGIONS, random);
    const letter = 'ABCDEFGHJKLMUVWXYZ'[randInt(0, 23, random)];
    return {
      street: `${streetNumber} ${streetName.replace(' Ave', ' Avenue').replace(' St', ' Street').replace(' Rd', ' Road').replace(' Ln', ' Lane')}`,
      district: region.county,
      city: region.city,
      region: region.county,
      regionFull: region.county,
      postal: `${region.postcodeArea}${randInt(1, 20, random)}${pick(['', letter], random)} ${randInt(1, 9, random)}${capitalize('abcdefghijklmnopqrstuvwxyz'[randInt(0, 25, random)])}${capitalize('abcdefghijklmnopqrstuvwxyz'[randInt(0, 25, random)])}`.toUpperCase(),
      phone: `0${randInt(1, 2, random)}${randInt(1, 9, random)} ${String(randInt(1000, 9999, random))} ${String(randInt(1000, 9999, random))}`,
    };
  }
  if (country === 'CA') {
    const region = pick(CA_REGIONS, random);
    const postalLetter = () => 'ABCEGHJKLMNPRSTVWXYZ'[randInt(0, 17, random)];
    return {
      street: `${streetNumber} ${streetName.replace(' Ave', ' Avenue').replace(' St', ' Street').replace(' Rd', ' Road').replace(' Ln', ' Lane')}`,
      district: '',
      city: region.city,
      region: region.province,
      regionFull: region.provinceFull,
      postal: `${region.postalFirst}${postalLetter()} ${randInt(1, 9, random)}${postalLetter()}${randInt(0, 9, random)}`,
      phone: `(${region.areaCode}) ${randInt(200, 999, random)}-${String(randInt(0, 9999, random)).padStart(4, '0')}`,
    };
  }
  const region = pick(AU_REGIONS, random);
  return {
    street: `${streetNumber} ${streetName.replace(' Ave', ' Avenue').replace(' St', ' Street').replace(' Rd', ' Road').replace(' Ln', ' Lane')}`,
    district: '',
    city: region.city,
    region: region.state,
    regionFull: region.stateFull,
    postal: region.postcode,
    phone: `${region.areaCode}-${randInt(1000, 9999, random)} ${String(randInt(1000, 9999, random))}`,
  };
};

export const generateIdentityProfile = (country: CountryCode, random: RandomFn = Math.random): IdentityProfile => {
  const male = random() < 0.5;
  const year = randInt(1950, 2006, random);
  const month = randInt(1, 12, random);
  const day = randInt(1, 28, random);
  const card = generateCard(random);
  const income = country === 'JP' || country === 'CN' ? randInt(9, 60, random) * 1000 : randInt(2, 20, random) * 1000 + randInt(0, 9, random) * 100;
  const incomeText = `${CURRENCY[country]}${income.toLocaleString('en-US')}`;

  let fullName: string;
  let hairColor: string;
  let occupation: string;
  let company: string;
  let address: { street: string; district: string; city: string; region: string; regionFull: string; postal: string; phone: string };
  let title: string;
  let gender: string;
  let birthday: string;
  let employment: string;
  let education: string;
  let nationalId = '';

  if (country === 'CN') {
    const region = pick(CN_REGIONS, random);
    fullName = cnName(male, random);
    gender = male ? '男' : '女';
    title = male ? '先生' : '女士';
    birthday = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    hairColor = pick(CN_HAIR, random);
    address = {
      street: `${region.district}${pick(CN_STREETS, random)}${randInt(1, 200, random)}号`,
      district: region.district,
      city: region.city,
      region: region.province,
      regionFull: region.province,
      postal: `${region.zipPrefix}${String(randInt(0, 99, random)).padStart(2, '0')}`,
      phone: generateCnMobile(random),
    };
    nationalId = generateCnIdCard(male, random);
    occupation = pick(CN_OCCUPATIONS, random);
    company = `${region.city.slice(0, 2)}${pick(CN_COMPANIES, random)}有限公司`;
    employment = pick(['全职', '兼职', '自由职业', '合同制'], random);
    education = pick(['大专及本科学历', '本科学历', '硕士学历', '高中学历', '博士学历'], random);
  } else if (country === 'JP') {
    const region = pick(JP_REGIONS, random);
    fullName = `${pick(JP_FAMILY, random)} ${pick(JP_GIVEN, random)}`;
    gender = male ? '男性' : '女性';
    title = '様';
    birthday = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    hairColor = pick(JP_HAIR, random);
    address = {
      street: `${region.district}${pick(JP_STREETS, random)}${randInt(1, 30, random)}-${randInt(1, 20, random)}-${randInt(1, 10, random)}`,
      district: region.city,
      city: region.city,
      region: region.pref,
      regionFull: region.pref,
      postal: region.zip,
      phone: `${region.areaCode}-${randInt(1000, 9999, random)}-${String(randInt(1000, 9999, random))}`,
    };
    nationalId = `${year}-${String(month).padStart(2, '0')}-${String(randInt(1000, 9999, random)).padStart(4, '0')}`;
    occupation = pick(JP_OCCUPATIONS, random);
    company = pick(JP_COMPANIES, random);
    employment = pick(['正社員', 'アルバイト', '自営業', '契約社員'], random);
    education = pick(['短大・大卒', '大卒', '院卒', '高卒'], random);
  } else if (country === 'DE') {
    const region = pick(DE_REGIONS, random);
    fullName = `${pick(male ? DE_GIVEN_M : DE_GIVEN_F, random)} ${pick(DE_FAMILY, random)}`;
    gender = male ? 'Männlich' : 'Weiblich';
    title = male ? 'Herr' : 'Frau';
    birthday = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
    hairColor = pick(DE_HAIR, random);
    address = {
      street: `${pick(DE_STREETS, random)} ${randInt(1, 120, random)}`,
      district: region.state,
      city: region.city,
      region: region.state,
      regionFull: region.state,
      postal: `${region.zipPrefix}${digitString(3, random)}`,
      phone: `${region.areaCode} ${randInt(1000000, 9999999, random)}`,
    };
    nationalId = `${randInt(1, 12, random)}.${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${digitString(4, random)}-${pick(['M', 'W'], random)}${digitString(4, random)}`;
    occupation = pick(DE_OCCUPATIONS, random);
    company = pick(DE_COMPANIES, random);
    employment = pick(['Vollzeit', 'Teilzeit', 'Selbstständig', 'Befristet'], random);
    education = pick(['Ausbildung', 'Bachelor', 'Master', 'Abitur', 'Promotion'], random);
  } else {
    const languageCountry = country as 'US' | 'UK' | 'CA' | 'AU';
    fullName = `${pick(male ? EN_MALE : EN_FEMALE, random)} ${pick(EN_LAST, random)}`;
    gender = male ? 'Male' : 'Female';
    title = male ? 'Mr.' : 'Ms.';
    birthday = country === 'US' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
    hairColor = pick(EN_HAIR, random);
    address = englishAddress(languageCountry, random);
    occupation = pick(EN_OCCUPATIONS, random);
    company = pick(EN_COMPANIES, random);
    employment = pick(EN_EMPLOYMENT, random);
    education = pick(EN_EDUCATION, random);
    if (country === 'US') {
      nationalId = `9${String(randInt(10, 99, random))}-${String(randInt(10, 99, random))}-${String(randInt(1000, 9999, random)).padStart(4, '0')}`;
    }
    if (country === 'UK') {
      nationalId = `QQ${String(randInt(100000, 999999, random))}C`;
    }
    if (country === 'CA') {
      nationalId = `${randInt(100, 999, random)} ${randInt(100, 999, random)} ${randInt(100, 999, random)}`;
    }
    if (country === 'AU') {
      nationalId = `${randInt(100000000, 499999999, random)}`;
    }
  }

  const feet = randInt(4, 7, random);
  const inches = randInt(0, 11, random);
  const cm = Math.round((feet * 12 + inches) * 2.54);
  const lbs = randInt(95, 260, random);
  const kg = Math.round(lbs * 0.4536 * 10) / 10;
  const metricHeight = `${cm}cm`;

  return {
    country,
    fullName,
    gender,
    title,
    birthday,
    hairColor,
    ...address,
    email: `${emailLocal(random)}@example.com`,
    cardType: card.type,
    cardNumber: card.number,
    cvv: card.cvv,
    cardExpiry: card.expiry,
    occupation,
    company,
    employment,
    monthlyIncome: incomeText,
    nationalId,
    username: `${pick(ADJECTIVES, random)}${pick(NOUNS, random)}`,
    password: strongPassword(random),
    height: country === 'CN' || country === 'JP' || country === 'DE' ? metricHeight : `${feet}' ${inches}" (${cm}cm)`,
    weight: country === 'CN' || country === 'JP' || country === 'DE' ? `${kg}kg` : `${lbs}lbs (${kg}kg)`,
    bloodType: pick(BLOOD_TYPES, random),
    operatingSystem: pick(OS_LIST, random),
    guid: guid(random),
    userAgent: randomUserAgent({ random }),
    education,
    website: `${slug(random)}.example.com`,
    securityQuestion: pick(SECURITY_QUESTIONS, random),
    securityAnswer: `${pick(ADJECTIVES, random)}${pick(NOUNS, random)}`,
  };
};
