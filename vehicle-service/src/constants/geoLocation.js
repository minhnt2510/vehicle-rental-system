const CITY_CENTERS = {
  'TP HCM': { latitude: 10.8231, longitude: 106.6297 },
  'HA NOI': { latitude: 21.0285, longitude: 105.8542 },
  'DA NANG': { latitude: 16.0544, longitude: 108.2022 }
};

const REGION_CENTERS = {
  TP_HCM: CITY_CENTERS['TP HCM'],
  HA_NOI: CITY_CENTERS['HA NOI'],
  DA_NANG: CITY_CENTERS['DA NANG']
};

const DISTRICT_CENTERS = {
  'TP HCM|QUAN 1': { latitude: 10.7757, longitude: 106.7004 },
  'TP HCM|QUAN 3': { latitude: 10.7838, longitude: 106.6873 },
  'TP HCM|BINH THANH': { latitude: 10.8107, longitude: 106.7091 },
  'TP HCM|GO VAP': { latitude: 10.8387, longitude: 106.6653 },
  'TP HCM|TAN BINH': { latitude: 10.8035, longitude: 106.6521 },
  'TP HCM|THU DUC': { latitude: 10.8493, longitude: 106.7728 },
  'TP HCM|PHU NHUAN': { latitude: 10.799, longitude: 106.6801 },
  'TP HCM|QUAN 7': { latitude: 10.7341, longitude: 106.7215 },
  'HA NOI|HOAN KIEM': { latitude: 21.0287, longitude: 105.8524 },
  'HA NOI|BA DINH': { latitude: 21.0359, longitude: 105.8342 },
  'HA NOI|DONG DA': { latitude: 21.018, longitude: 105.8299 },
  'HA NOI|CAU GIAY': { latitude: 21.0303, longitude: 105.7922 },
  'HA NOI|HA DONG': { latitude: 20.9718, longitude: 105.7603 },
  'HA NOI|NAM TU LIEM': { latitude: 21.0122, longitude: 105.7566 },
  'HA NOI|THANH XUAN': { latitude: 20.9931, longitude: 105.8104 },
  'HA NOI|TAY HO': { latitude: 21.0701, longitude: 105.8163 }
};

const DISTRICT_ALIASES = {
  'QUAN MOT': 'QUAN 1',
  'QUAN BA': 'QUAN 3',
  'QUAN BAY': 'QUAN 7',
  'TP THU DUC': 'THU DUC',
  'THANH PHO THU DUC': 'THU DUC',
  'HO CHI MINH': 'TP HCM',
  'HCM': 'TP HCM',
  'HANOI': 'HA NOI',
  'DANANG': 'DA NANG',
  'GO VAP': 'GO VAP',
  'BINH THANH': 'BINH THANH',
  'PHU NHUAN': 'PHU NHUAN',
  'TAN BINH': 'TAN BINH',
  'CAU GIAY': 'CAU GIAY',
  'HOAN KIEM': 'HOAN KIEM',
  'BA DINH': 'BA DINH',
  'DONG DA': 'DONG DA',
  'HA DONG': 'HA DONG',
  'NAM TU LIEM': 'NAM TU LIEM',
  'THANH XUAN': 'THANH XUAN',
  'TAY HO': 'TAY HO'
};

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function findDistrictFromText(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return '';

  for (const districtKey of Object.keys(DISTRICT_ALIASES)) {
    if (normalized.includes(districtKey)) {
      return DISTRICT_ALIASES[districtKey];
    }
  }

  return '';
}

function normalizeCity(city = '') {
  const normalized = normalizeText(city);
  return DISTRICT_ALIASES[normalized] || normalized;
}

function normalizeDistrict(district = '', fallbackText = '') {
  const primary = normalizeText(district);
  if (primary && DISTRICT_ALIASES[primary]) {
    return DISTRICT_ALIASES[primary];
  }
  if (primary) {
    return primary;
  }
  return findDistrictFromText(fallbackText);
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toGeoPoint({ latitude, longitude }) {
  return {
    type: 'Point',
    coordinates: [Number(longitude), Number(latitude)]
  };
}

function resolveCoordinates(payload = {}) {
  const directLatitude = toNumber(payload.latitude);
  const directLongitude = toNumber(payload.longitude);

  if (directLatitude !== null && directLongitude !== null) {
    return {
      latitude: directLatitude,
      longitude: directLongitude,
      source: 'direct'
    };
  }

  const city = normalizeCity(payload.city || '');
  const hintText = [payload.pickup_location, payload.return_location, payload.address]
    .filter(Boolean)
    .join(' ');
  const district = normalizeDistrict(payload.district || '', hintText);
  const districtKey = city && district ? `${city}|${district}` : '';

  if (districtKey && DISTRICT_CENTERS[districtKey]) {
    return {
      ...DISTRICT_CENTERS[districtKey],
      source: 'district'
    };
  }

  if (city && CITY_CENTERS[city]) {
    return {
      ...CITY_CENTERS[city],
      source: 'city'
    };
  }

  const region = String(payload.allowed_region || '').toUpperCase();
  if (REGION_CENTERS[region]) {
    return {
      ...REGION_CENTERS[region],
      source: 'region'
    };
  }

  return null;
}

export {
  CITY_CENTERS,
  DISTRICT_CENTERS,
  resolveCoordinates,
  toGeoPoint
};
