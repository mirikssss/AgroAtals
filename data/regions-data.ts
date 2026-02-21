// Central Asian countries with regions and districts
// Currently only Uzbekistan has district-level data

export interface District {
  name: string
  nameLocal?: string
}

export interface Region {
  name: string
  nameLocal?: string
  districts: District[]
}

export interface Country {
  code: string
  name: string
  nameLocal: string
  center: [number, number] // [lat, lng]
  zoom: number
  hasGeoJSON: boolean
  regions: Region[]
}

export interface DistrictRiskData {
  riskScore: number // 0-1
  valueAtRisk: string
  yieldAnomaly: string
  aiInsight: string
  population?: number
}

// Mock risk data for Uzbekistan districts
export const mockDistrictData: Record<string, DistrictRiskData> = {
  // Tashkent region
  'Tashkent': {
    riskScore: 0.25,
    valueAtRisk: '$1.2M',
    yieldAnomaly: '+3.2%',
    aiInsight: 'Stable conditions. Urban area with limited agricultural activity. Low drought risk.'
  },
  'Olmaliq': {
    riskScore: 0.35,
    valueAtRisk: '$0.8M',
    yieldAnomaly: '+1.5%',
    aiInsight: 'Industrial zone. Minor water stress detected. Monitor pollution levels.'
  },
  'Chirchiq': {
    riskScore: 0.3,
    valueAtRisk: '$0.6M',
    yieldAnomaly: '+2.1%',
    aiInsight: 'Good water supply from Chirchik river. Stable agricultural conditions.'
  },
  'Angren': {
    riskScore: 0.45,
    valueAtRisk: '$0.5M',
    yieldAnomaly: '-1.2%',
    aiInsight: 'Mining area. Soil quality concerns. Recommend soil testing.'
  },
  'Bekobod': {
    riskScore: 0.4,
    valueAtRisk: '$0.7M',
    yieldAnomaly: '+0.8%',
    aiInsight: 'Border area with good irrigation. Monitor cross-border water agreements.'
  },
  
  // Samarkand region
  'Samarkand': {
    riskScore: 0.55,
    valueAtRisk: '$2.1M',
    yieldAnomaly: '-4.5%',
    aiInsight: 'Moderate drought stress detected via Sentinel-2. Historical irrigation infrastructure needs upgrade.'
  },
  'Urgut': {
    riskScore: 0.62,
    valueAtRisk: '$1.4M',
    yieldAnomaly: '-6.2%',
    aiInsight: 'Mountain region. Water runoff declining. Recommend terracing improvements.'
  },
  'Kattaqo\'rg\'on': {
    riskScore: 0.48,
    valueAtRisk: '$1.8M',
    yieldAnomaly: '-2.3%',
    aiInsight: 'Cotton growing area. Moderate water stress. Drip irrigation recommended.'
  },
  'Jomboy': {
    riskScore: 0.52,
    valueAtRisk: '$1.1M',
    yieldAnomaly: '-3.8%',
    aiInsight: 'Vineyard region. Increasing temperature anomaly detected.'
  },
  
  // Bukhara region
  'Bukhara': {
    riskScore: 0.72,
    valueAtRisk: '$3.2M',
    yieldAnomaly: '-12.5%',
    aiInsight: 'HIGH RISK: Severe drought conditions. NDVI shows significant vegetation stress. Immediate irrigation support required.'
  },
  'Kogon': {
    riskScore: 0.68,
    valueAtRisk: '$1.9M',
    yieldAnomaly: '-9.8%',
    aiInsight: 'Desert proximity causing heat stress. Recommend heat-resistant crop varieties.'
  },
  'Jondor': {
    riskScore: 0.75,
    valueAtRisk: '$2.4M',
    yieldAnomaly: '-14.2%',
    aiInsight: 'CRITICAL: Water table dropping rapidly. Groundwater depletion detected via GRACE satellite data.'
  },
  'Qorako\'l': {
    riskScore: 0.71,
    valueAtRisk: '$2.0M',
    yieldAnomaly: '-11.3%',
    aiInsight: 'Aral Sea region impact. Soil salinization increasing. Drainage systems needed.'
  },
  
  // Fergana region
  'Fergana': {
    riskScore: 0.38,
    valueAtRisk: '$1.5M',
    yieldAnomaly: '-1.8%',
    aiInsight: 'Fertile valley. Good conditions overall. Minor pest pressure detected.'
  },
  'Qo\'qon': {
    riskScore: 0.42,
    valueAtRisk: '$1.3M',
    yieldAnomaly: '-2.5%',
    aiInsight: 'Cotton monoculture risk. Recommend crop diversification.'
  },
  'Marg\'ilon': {
    riskScore: 0.35,
    valueAtRisk: '$1.1M',
    yieldAnomaly: '+0.5%',
    aiInsight: 'Silk industry area. Mulberry trees healthy. Good moisture levels.'
  },
  'Quva': {
    riskScore: 0.45,
    valueAtRisk: '$0.9M',
    yieldAnomaly: '-3.2%',
    aiInsight: 'Border region. Cross-border water management improving.'
  },
  
  // Andijon region
  'Andijon': {
    riskScore: 0.32,
    valueAtRisk: '$1.4M',
    yieldAnomaly: '+1.2%',
    aiInsight: 'Most densely populated. Intensive farming. Good yields expected.'
  },
  'Asaka': {
    riskScore: 0.28,
    valueAtRisk: '$0.8M',
    yieldAnomaly: '+2.8%',
    aiInsight: 'Industrial-agricultural mix. Automotive industry provides economic stability.'
  },
  'Xo\'jaobod': {
    riskScore: 0.36,
    valueAtRisk: '$0.7M',
    yieldAnomaly: '+0.3%',
    aiInsight: 'Small-scale farming. Water access improving with new canals.'
  },
  
  // Namangan region
  'Namangan': {
    riskScore: 0.4,
    valueAtRisk: '$1.6M',
    yieldAnomaly: '-0.8%',
    aiInsight: 'Fruit orchards dominant. Minor frost risk in spring. Recommend protective measures.'
  },
  'Chortoq': {
    riskScore: 0.48,
    valueAtRisk: '$1.0M',
    yieldAnomaly: '-2.1%',
    aiInsight: 'Mountain foothills. Erosion risk detected. Terracing recommended.'
  },
  'Pop': {
    riskScore: 0.55,
    valueAtRisk: '$0.8M',
    yieldAnomaly: '-4.5%',
    aiInsight: 'Remote area. Limited infrastructure. Satellite monitoring shows water stress.'
  },
  
  // Navoiy region
  'Navoiy': {
    riskScore: 0.65,
    valueAtRisk: '$2.8M',
    yieldAnomaly: '-8.5%',
    aiInsight: 'Desert region. High evapotranspiration rates. Gold mining water usage impacting agriculture.'
  },
  'Zarafshon': {
    riskScore: 0.78,
    valueAtRisk: '$1.5M',
    yieldAnomaly: '-15.2%',
    aiInsight: 'CRITICAL: Extreme aridity. Kyzylkum desert expansion detected. Desertification control needed.'
  },
  'Nurota': {
    riskScore: 0.58,
    valueAtRisk: '$0.9M',
    yieldAnomaly: '-5.8%',
    aiInsight: 'Mountain oasis. Water springs decreasing. Conservation measures urgent.'
  },
  
  // Qashqadaryo region
  'Qarshi': {
    riskScore: 0.52,
    valueAtRisk: '$2.2M',
    yieldAnomaly: '-4.2%',
    aiInsight: 'Steppe region. Karshi canal system needs maintenance. Moderate drought risk.'
  },
  'Shahrisabz': {
    riskScore: 0.45,
    valueAtRisk: '$1.4M',
    yieldAnomaly: '-2.8%',
    aiInsight: 'Historical tourism area. Agricultural land under pressure from development.'
  },
  'Kitob': {
    riskScore: 0.48,
    valueAtRisk: '$1.0M',
    yieldAnomaly: '-3.5%',
    aiInsight: 'Observatory region. Clear skies indicate low cloud cover - monitor for drought.'
  },
  
  // Surxondaryo region
  'Termiz': {
    riskScore: 0.58,
    valueAtRisk: '$1.8M',
    yieldAnomaly: '-5.5%',
    aiInsight: 'Hottest region. Extreme heat events increasing. Heat-resistant crops essential.'
  },
  'Denov': {
    riskScore: 0.42,
    valueAtRisk: '$1.2M',
    yieldAnomaly: '-1.5%',
    aiInsight: 'Amu Darya river access. Good irrigation potential. Flooding risk in spring.'
  },
  'Sherobod': {
    riskScore: 0.55,
    valueAtRisk: '$0.9M',
    yieldAnomaly: '-4.8%',
    aiInsight: 'Border region with Afghanistan. Trans-boundary water management critical.'
  },
  
  // Xorazm region
  'Urganch': {
    riskScore: 0.62,
    valueAtRisk: '$2.0M',
    yieldAnomaly: '-7.2%',
    aiInsight: 'Amu Darya delta. Salinization increasing. Drainage improvements needed.'
  },
  'Xiva': {
    riskScore: 0.58,
    valueAtRisk: '$1.5M',
    yieldAnomaly: '-5.8%',
    aiInsight: 'UNESCO heritage site. Tourism-agriculture balance needed. Water competition.'
  },
  'Shovot': {
    riskScore: 0.65,
    valueAtRisk: '$1.1M',
    yieldAnomaly: '-8.5%',
    aiInsight: 'Lower Amu Darya. Water availability declining. Aral Sea crisis impact.'
  },
  
  // Karakalpakstan
  'Nukus': {
    riskScore: 0.82,
    valueAtRisk: '$4.5M',
    yieldAnomaly: '-22.5%',
    aiInsight: 'EMERGENCY: Aral Sea disaster zone. Massive ecological damage. Salt storms affecting health and crops. Major intervention required.'
  },
  'Mo\'ynoq': {
    riskScore: 0.95,
    valueAtRisk: '$1.2M',
    yieldAnomaly: '-45.0%',
    aiInsight: 'CATASTROPHIC: Former fishing port now 150km from water. Complete agricultural collapse. Humanitarian situation.'
  },
  'Qo\'ng\'irot': {
    riskScore: 0.78,
    valueAtRisk: '$2.1M',
    yieldAnomaly: '-18.5%',
    aiInsight: 'CRITICAL: Severe desertification. Dust storms frequent. Emergency water supply needed.'
  },
  'Chimboy': {
    riskScore: 0.72,
    valueAtRisk: '$1.8M',
    yieldAnomaly: '-14.2%',
    aiInsight: 'Salt accumulation in soils. Traditional cotton farming collapsing. Alternative livelihoods needed.'
  },
  
  // Jizzax region
  'Jizzax': {
    riskScore: 0.48,
    valueAtRisk: '$1.5M',
    yieldAnomaly: '-3.2%',
    aiInsight: 'Steppe-mountain transition. Variable precipitation. Weather-indexed insurance recommended.'
  },
  'Zomin': {
    riskScore: 0.38,
    valueAtRisk: '$0.8M',
    yieldAnomaly: '+1.2%',
    aiInsight: 'Mountain resort area. Good water from snowmelt. Sustainable tourism potential.'
  },
  'Dustlik': {
    riskScore: 0.52,
    valueAtRisk: '$0.9M',
    yieldAnomaly: '-4.5%',
    aiInsight: 'Hungry Steppe reclamation area. Irrigation dependent. Canal maintenance critical.'
  },
  
  // Sirdaryo region
  'Guliston': {
    riskScore: 0.45,
    valueAtRisk: '$1.3M',
    yieldAnomaly: '-2.0%',
    aiInsight: 'Syr Darya river basin. Good water access but salinity increasing.'
  },
  'Yangiyer': {
    riskScore: 0.42,
    valueAtRisk: '$0.9M',
    yieldAnomaly: '-1.5%',
    aiInsight: 'Industrial zone. Hydropower provides stable electricity for irrigation pumps.'
  },
  'Sirdaryo': {
    riskScore: 0.5,
    valueAtRisk: '$1.1M',
    yieldAnomaly: '-3.8%',
    aiInsight: 'Cotton and wheat region. Crop rotation improving soil health.'
  }
}

// National average data (used when no district is selected)
export const nationalAverageData: DistrictRiskData = {
  riskScore: 0.52,
  valueAtRisk: '$48.5M',
  yieldAnomaly: '-5.8%',
  aiInsight: 'National overview: Moderate drought conditions across southern regions. Aral Sea zone requires emergency attention. Eastern valleys showing resilience.'
}

// Central Asian countries data
export const centralAsianCountries: Country[] = [
  {
    code: 'UZB',
    name: 'Uzbekistan',
    nameLocal: 'Ўзбекистон',
    center: [41.3775, 64.5853],
    zoom: 6,
    hasGeoJSON: true,
    regions: [
      {
        name: 'Tashkent',
        nameLocal: 'Тошкент',
        districts: [
          { name: 'Tashkent', nameLocal: 'Тошкент шаҳри' },
          { name: 'Olmaliq', nameLocal: 'Олмалиқ' },
          { name: 'Chirchiq', nameLocal: 'Чирчиқ' },
          { name: 'Angren', nameLocal: 'Ангрен' },
          { name: 'Bekobod', nameLocal: 'Бекобод' },
          { name: 'Nurafshon', nameLocal: 'Нурафшон' },
          { name: 'Oqqo\'rg\'on', nameLocal: 'Оққўрғон' },
          { name: 'Bo\'stonliq', nameLocal: 'Бўстонлиқ' },
          { name: 'Zangiota', nameLocal: 'Зангиота' },
          { name: 'Qibray', nameLocal: 'Қибрай' },
          { name: 'Parkent', nameLocal: 'Паркент' },
          { name: 'Piskent', nameLocal: 'Пискент' },
        ]
      },
      {
        name: 'Samarkand',
        nameLocal: 'Самарқанд',
        districts: [
          { name: 'Samarkand', nameLocal: 'Самарқанд шаҳри' },
          { name: 'Urgut', nameLocal: 'Ургут' },
          { name: 'Kattaqo\'rg\'on', nameLocal: 'Каттақўрғон' },
          { name: 'Jomboy', nameLocal: 'Жомбой' },
          { name: 'Pastdarg\'om', nameLocal: 'Пастдарғом' },
          { name: 'Payariq', nameLocal: 'Пайариқ' },
          { name: 'Bulungur', nameLocal: 'Булунғур' },
          { name: 'Ishtixon', nameLocal: 'Иштихон' },
          { name: 'Narpay', nameLocal: 'Нарпай' },
          { name: 'Nurobod', nameLocal: 'Нуробод' },
          { name: 'Oqdaryo', nameLocal: 'Оқдарё' },
          { name: 'Toyloq', nameLocal: 'Тойлоқ' },
        ]
      },
      {
        name: 'Bukhara',
        nameLocal: 'Бухоро',
        districts: [
          { name: 'Bukhara', nameLocal: 'Бухоро шаҳри' },
          { name: 'Kogon', nameLocal: 'Когон' },
          { name: 'Jondor', nameLocal: 'Жондор' },
          { name: 'Qorako\'l', nameLocal: 'Қоракўл' },
          { name: 'G\'ijduvon', nameLocal: 'Ғиждувон' },
          { name: 'Vobkent', nameLocal: 'Вобкент' },
          { name: 'Olot', nameLocal: 'Олот' },
          { name: 'Romitan', nameLocal: 'Ромитан' },
          { name: 'Shofirkon', nameLocal: 'Шофиркон' },
          { name: 'Peshku', nameLocal: 'Пешку' },
          { name: 'Qorovulbozor', nameLocal: 'Қоровулбозор' },
        ]
      },
      {
        name: 'Fergana',
        nameLocal: 'Фарғона',
        districts: [
          { name: 'Fergana', nameLocal: 'Фарғона шаҳри' },
          { name: 'Qo\'qon', nameLocal: 'Қўқон' },
          { name: 'Marg\'ilon', nameLocal: 'Марғилон' },
          { name: 'Quva', nameLocal: 'Қува' },
          { name: 'Rishton', nameLocal: 'Риштон' },
          { name: 'Oltiariq', nameLocal: 'Олтиариқ' },
          { name: 'Bog\'dod', nameLocal: 'Боғдод' },
          { name: 'Buvayda', nameLocal: 'Бувайда' },
          { name: 'Dang\'ara', nameLocal: 'Данғара' },
          { name: 'Furqat', nameLocal: 'Фурқат' },
          { name: 'Qo\'shtepa', nameLocal: 'Қўштепа' },
          { name: 'So\'x', nameLocal: 'Сўх' },
          { name: 'Toshloq', nameLocal: 'Тошлоқ' },
          { name: 'Uchko\'prik', nameLocal: 'Учкўприк' },
          { name: 'Yozyovon', nameLocal: 'Ёзёвон' },
        ]
      },
      {
        name: 'Andijon',
        nameLocal: 'Андижон',
        districts: [
          { name: 'Andijon', nameLocal: 'Андижон шаҳри' },
          { name: 'Asaka', nameLocal: 'Асака' },
          { name: 'Xo\'jaobod', nameLocal: 'Хўжаобод' },
          { name: 'Qo\'rg\'ontepa', nameLocal: 'Қўрғонтепа' },
          { name: 'Marhamat', nameLocal: 'Марҳамат' },
          { name: 'Oltinko\'l', nameLocal: 'Олтинкўл' },
          { name: 'Baliqchi', nameLocal: 'Балиқчи' },
          { name: 'Bo\'z', nameLocal: 'Бўз' },
          { name: 'Buloqboshi', nameLocal: 'Булоқбоши' },
          { name: 'Izboskan', nameLocal: 'Избоскан' },
          { name: 'Jalaquduq', nameLocal: 'Жалақудуқ' },
          { name: 'Paxtaobod', nameLocal: 'Пахтаобод' },
          { name: 'Shahrixon', nameLocal: 'Шаҳрихон' },
          { name: 'Ulug\'nor', nameLocal: 'Улуғнор' },
        ]
      },
      {
        name: 'Namangan',
        nameLocal: 'Наманган',
        districts: [
          { name: 'Namangan', nameLocal: 'Наманган шаҳри' },
          { name: 'Chortoq', nameLocal: 'Чортоқ' },
          { name: 'Pop', nameLocal: 'Поп' },
          { name: 'Chust', nameLocal: 'Чуст' },
          { name: 'Kosonsoy', nameLocal: 'Косонсой' },
          { name: 'Mingbuloq', nameLocal: 'Мингбулоқ' },
          { name: 'Namangan', nameLocal: 'Наманган' },
          { name: 'Norin', nameLocal: 'Норин' },
          { name: 'To\'raqo\'rg\'on', nameLocal: 'Тўрақўрғон' },
          { name: 'Uchqo\'rg\'on', nameLocal: 'Учқўрғон' },
          { name: 'Yangiqo\'rg\'on', nameLocal: 'Янгиқўрғон' },
        ]
      },
      {
        name: 'Navoiy',
        nameLocal: 'Навоий',
        districts: [
          { name: 'Navoiy', nameLocal: 'Навоий шаҳри' },
          { name: 'Zarafshon', nameLocal: 'Зарафшон' },
          { name: 'Nurota', nameLocal: 'Нурота' },
          { name: 'Karmana', nameLocal: 'Кармана' },
          { name: 'Konimex', nameLocal: 'Конимех' },
          { name: 'Navbahor', nameLocal: 'Навбаҳор' },
          { name: 'Qiziltepa', nameLocal: 'Қизилтепа' },
          { name: 'Tomdi', nameLocal: 'Томди' },
          { name: 'Uchquduq', nameLocal: 'Учқудуқ' },
          { name: 'Xatirchi', nameLocal: 'Хатирчи' },
        ]
      },
      {
        name: 'Qashqadaryo',
        nameLocal: 'Қашқадарё',
        districts: [
          { name: 'Qarshi', nameLocal: 'Қарши шаҳри' },
          { name: 'Shahrisabz', nameLocal: 'Шаҳрисабз' },
          { name: 'Kitob', nameLocal: 'Китоб' },
          { name: 'Chiroqchi', nameLocal: 'Чироқчи' },
          { name: 'Dehqonobod', nameLocal: 'Деҳқонобод' },
          { name: 'G\'uzor', nameLocal: 'Ғузор' },
          { name: 'Kasbi', nameLocal: 'Касби' },
          { name: 'Koson', nameLocal: 'Косон' },
          { name: 'Mirishkor', nameLocal: 'Миришкор' },
          { name: 'Muborak', nameLocal: 'Муборак' },
          { name: 'Nishon', nameLocal: 'Нишон' },
          { name: 'Qamashi', nameLocal: 'Қамаши' },
          { name: 'Yakkabog\'', nameLocal: 'Яккабоғ' },
        ]
      },
      {
        name: 'Surxondaryo',
        nameLocal: 'Сурхондарё',
        districts: [
          { name: 'Termiz', nameLocal: 'Термиз шаҳри' },
          { name: 'Denov', nameLocal: 'Денов' },
          { name: 'Sherobod', nameLocal: 'Шеробод' },
          { name: 'Angor', nameLocal: 'Ангор' },
          { name: 'Bandixon', nameLocal: 'Бандихон' },
          { name: 'Boysun', nameLocal: 'Бойсун' },
          { name: 'Jarqo\'rg\'on', nameLocal: 'Жарқўрғон' },
          { name: 'Muzrabot', nameLocal: 'Музработ' },
          { name: 'Oltinsoy', nameLocal: 'Олтинсой' },
          { name: 'Qiziriq', nameLocal: 'Қизириқ' },
          { name: 'Qumqo\'rg\'on', nameLocal: 'Қумқўрғон' },
          { name: 'Sariosiyo', nameLocal: 'Сариосиё' },
          { name: 'Uzun', nameLocal: 'Узун' },
        ]
      },
      {
        name: 'Xorazm',
        nameLocal: 'Хоразм',
        districts: [
          { name: 'Urganch', nameLocal: 'Урганч шаҳри' },
          { name: 'Xiva', nameLocal: 'Хива' },
          { name: 'Shovot', nameLocal: 'Шовот' },
          { name: 'Bog\'ot', nameLocal: 'Боғот' },
          { name: 'Gurlan', nameLocal: 'Гурлан' },
          { name: 'Qo\'shko\'pir', nameLocal: 'Қўшкўпир' },
          { name: 'Yangiariq', nameLocal: 'Янгиариқ' },
          { name: 'Yangibozor', nameLocal: 'Янгибозор' },
          { name: 'Hazorasp', nameLocal: 'Ҳазорасп' },
          { name: 'Xonqa', nameLocal: 'Хонқа' },
        ]
      },
      {
        name: 'Karakalpakstan',
        nameLocal: 'Қорақалпоғистон',
        districts: [
          { name: 'Nukus', nameLocal: 'Нукус шаҳри' },
          { name: 'Mo\'ynoq', nameLocal: 'Мўйноқ' },
          { name: 'Qo\'ng\'irot', nameLocal: 'Қўнғирот' },
          { name: 'Chimboy', nameLocal: 'Чимбой' },
          { name: 'Amudaryo', nameLocal: 'Амударё' },
          { name: 'Beruniy', nameLocal: 'Беруний' },
          { name: 'Ellikqal\'a', nameLocal: 'Элликқалъа' },
          { name: 'Kegeyli', nameLocal: 'Кегейли' },
          { name: 'Qanliko\'l', nameLocal: 'Қанликўл' },
          { name: 'Qorao\'zak', nameLocal: 'Қораўзак' },
          { name: 'Shumanay', nameLocal: 'Шуманай' },
          { name: 'Taxtako\'pir', nameLocal: 'Тахтакўпир' },
          { name: 'To\'rtko\'l', nameLocal: 'Тўрткўл' },
          { name: 'Xo\'jayli', nameLocal: 'Хўжайли' },
        ]
      },
      {
        name: 'Jizzax',
        nameLocal: 'Жиззах',
        districts: [
          { name: 'Jizzax', nameLocal: 'Жиззах шаҳри' },
          { name: 'Zomin', nameLocal: 'Зомин' },
          { name: 'Dustlik', nameLocal: 'Дўстлик' },
          { name: 'Arnasoy', nameLocal: 'Арнасой' },
          { name: 'Baxmal', nameLocal: 'Бахмал' },
          { name: 'Do\'stlik', nameLocal: 'Дўстлик' },
          { name: 'Forish', nameLocal: 'Фориш' },
          { name: 'G\'allaorol', nameLocal: 'Ғаллаорол' },
          { name: 'Mirzacho\'l', nameLocal: 'Мирзачўл' },
          { name: 'Paxtakor', nameLocal: 'Пахтакор' },
          { name: 'Sharof Rashidov', nameLocal: 'Шароф Рашидов' },
          { name: 'Yangiobod', nameLocal: 'Янгиобод' },
        ]
      },
      {
        name: 'Sirdaryo',
        nameLocal: 'Сирдарё',
        districts: [
          { name: 'Guliston', nameLocal: 'Гулистон шаҳри' },
          { name: 'Yangiyer', nameLocal: 'Янгиер' },
          { name: 'Sirdaryo', nameLocal: 'Сирдарё' },
          { name: 'Shirin', nameLocal: 'Ширин' },
          { name: 'Boyovut', nameLocal: 'Боёвут' },
          { name: 'Guliston', nameLocal: 'Гулистон' },
          { name: 'Mirzaobod', nameLocal: 'Мирзаобод' },
          { name: 'Oqoltin', nameLocal: 'Оқолтин' },
          { name: 'Sardoba', nameLocal: 'Сардоба' },
          { name: 'Sayxunobod', nameLocal: 'Сайхунобод' },
          { name: 'Xavos', nameLocal: 'Хавос' },
        ]
      },
    ]
  },
  {
    code: 'KAZ',
    name: 'Kazakhstan',
    nameLocal: 'Қазақстан',
    center: [48.0196, 66.9237],
    zoom: 5,
    hasGeoJSON: false,
    regions: [
      { name: 'Almaty', nameLocal: 'Алматы', districts: [] },
      { name: 'Astana', nameLocal: 'Астана', districts: [] },
      { name: 'Shymkent', nameLocal: 'Шымкент', districts: [] },
      { name: 'Akmola', nameLocal: 'Ақмола', districts: [] },
      { name: 'Aktobe', nameLocal: 'Ақтөбе', districts: [] },
      { name: 'Almaty Region', nameLocal: 'Алматы облысы', districts: [] },
      { name: 'Atyrau', nameLocal: 'Атырау', districts: [] },
      { name: 'East Kazakhstan', nameLocal: 'Шығыс Қазақстан', districts: [] },
      { name: 'Jambyl', nameLocal: 'Жамбыл', districts: [] },
      { name: 'Karaganda', nameLocal: 'Қарағанды', districts: [] },
      { name: 'Kostanay', nameLocal: 'Қостанай', districts: [] },
      { name: 'Kyzylorda', nameLocal: 'Қызылорда', districts: [] },
      { name: 'Mangystau', nameLocal: 'Маңғыстау', districts: [] },
      { name: 'North Kazakhstan', nameLocal: 'Солтүстік Қазақстан', districts: [] },
      { name: 'Pavlodar', nameLocal: 'Павлодар', districts: [] },
      { name: 'Turkistan', nameLocal: 'Түркістан', districts: [] },
      { name: 'West Kazakhstan', nameLocal: 'Батыс Қазақстан', districts: [] },
    ]
  },
  {
    code: 'TJK',
    name: 'Tajikistan',
    nameLocal: 'Тоҷикистон',
    center: [38.861, 71.2761],
    zoom: 7,
    hasGeoJSON: false,
    regions: [
      { name: 'Dushanbe', nameLocal: 'Душанбе', districts: [] },
      { name: 'Sughd', nameLocal: 'Суғд', districts: [] },
      { name: 'Khatlon', nameLocal: 'Хатлон', districts: [] },
      { name: 'GBAO', nameLocal: 'ВМКБ', districts: [] },
      { name: 'RRP', nameLocal: 'НТҶ', districts: [] },
    ]
  },
  {
    code: 'KGZ',
    name: 'Kyrgyzstan',
    nameLocal: 'Кыргызстан',
    center: [41.2044, 74.7661],
    zoom: 7,
    hasGeoJSON: false,
    regions: [
      { name: 'Bishkek', nameLocal: 'Бишкек', districts: [] },
      { name: 'Osh', nameLocal: 'Ош', districts: [] },
      { name: 'Chuy', nameLocal: 'Чүй', districts: [] },
      { name: 'Issyk-Kul', nameLocal: 'Ысык-Көл', districts: [] },
      { name: 'Jalal-Abad', nameLocal: 'Жалал-Абад', districts: [] },
      { name: 'Naryn', nameLocal: 'Нарын', districts: [] },
      { name: 'Batken', nameLocal: 'Баткен', districts: [] },
      { name: 'Talas', nameLocal: 'Талас', districts: [] },
    ]
  },
  {
    code: 'TKM',
    name: 'Turkmenistan',
    nameLocal: 'Türkmenistan',
    center: [38.9697, 59.5563],
    zoom: 6,
    hasGeoJSON: false,
    regions: [
      { name: 'Ashgabat', nameLocal: 'Aşgabat', districts: [] },
      { name: 'Ahal', nameLocal: 'Ahal', districts: [] },
      { name: 'Balkan', nameLocal: 'Balkan', districts: [] },
      { name: 'Dashoguz', nameLocal: 'Daşoguz', districts: [] },
      { name: 'Lebap', nameLocal: 'Lebap', districts: [] },
      { name: 'Mary', nameLocal: 'Mary', districts: [] },
    ]
  },
]

// Years available for analysis (label for 'current' is localized and year is set in the component)
export const availableYears = [
  { value: 'current', label: 'Current' },
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
  { value: '2023', label: '2023' },
  { value: '2022', label: '2022' },
  { value: '2021', label: '2021' },
  { value: '2020', label: '2020' },
  { value: '2019', label: '2019' },
  { value: '2018', label: '2018' },
]
