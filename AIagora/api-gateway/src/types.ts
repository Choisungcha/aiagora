export interface GatewayResponse<T = unknown> {
  source: string;
  data: T;
  affiliate: string | null;
  cachedAt: number;
  ttl: number;
}

export interface ProductItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  link: string;
  source: string;
}

export interface FlightResult {
  from: string;
  to: string;
  date: string;
  price: number;
  airline: string;
  duration: string;
  affiliateUrl: string;
}

export interface HotelResult {
  id: string;
  name: string;
  location: string;
  pricePerNight: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  affiliateUrl: string;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  category: string;
  phone: string;
  rating: number;
  reviewCount: number;
  lat: number;
  lng: number;
}

export interface WeatherResult {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  observedAt: string;
}

export interface ExchangeResult {
  currency: string;
  rate: number;
  unit: number;
  date: string;
}

export interface PriceResult {
  item: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  products: ProductItem[];
}

export interface NewsItem {
  title: string;
  description: string;
  link: string;
  publishedAt: string;
  source: string;
}

export interface StockItem {
  code: string;
  name: string;
  market: string;
  price: number;
  changeRate: number;
  link: string;
}

export interface SubwayArrival {
  stationName: string;
  line: string;
  direction: string;
  message: string;
  remainSeconds: number;
}

export interface DeliveryEvent {
  time: string;
  location: string;
  status: string;
}

export interface DeliveryStatus {
  trackingNumber: string;
  carrier: string;
  status: string;
  location: string;
  timestamp: string;
  history: DeliveryEvent[];
}

export interface AirQualityResult {
  location: string;
  pm10: number;       // 미세먼지 (μg/m³)
  pm25: number;       // 초미세먼지 (μg/m³)
  o3: number;         // 오존
  no2: number;        // 이산화질소
  grade: string;      // 통합등급: 좋음/보통/나쁨/매우나쁨
  measuredAt: string;
}

export interface ApartmentTransaction {
  aptName: string;
  area: number;       // 전용면적 (㎡)
  floor: number;
  dealAmount: number; // 거래금액 (만원)
  dealYear: number;
  dealMonth: number;
  dealDay: number;
  dong: string;       // 법정동
  buildYear: number;
}

export interface TrainSchedule {
  trainNo: string;
  trainType: string;  // KTX/새마을/무궁화
  depStation: string;
  arrStation: string;
  depTime: string;
  arrTime: string;
  duration: string;
  seatAvail: string;
}

export interface TouristSpot {
  id: string;
  title: string;
  address: string;
  category: string;
  imageUrl: string;
  overview: string;
  mapX: number;
  mapY: number;
}

export interface CryptoTicker {
  market: string;     // KRW-BTC 형식
  name: string;
  price: number;
  changeRate: number;
  volume24h: number;
}

export interface GasStationPrice {
  region: string;
  gasoline: number;   // 휘발유 (원/L)
  diesel: number;     // 경유 (원/L)
  lpg: number;        // LPG (원/L)
  updatedAt: string;
}

export interface DartDisclosure {
  corpName: string;
  disclosureTitle: string;
  disclosureDate: string;
  reportType: string;
  link: string;
}
