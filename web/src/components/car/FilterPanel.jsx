import React, { useMemo } from 'react';
import { Crosshair, Search, SlidersHorizontal } from 'lucide-react';
import {
  FUEL_TYPE_OPTIONS,
  TRANSMISSION_OPTIONS,
  VEHICLE_STATUS_OPTIONS,
  VEHICLE_TYPE_FILTER_OPTIONS
} from '../../constants/vehicle';
import {
  CITY_OPTIONS,
  getDistrictOptions,
  getPickupAreaOptions
} from '../../constants/locationOptions';

const DRIVER_MODE_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'SELF_DRIVE', label: 'Tự lái' },
  { value: 'WITH_DRIVER', label: 'Có tài xế' }
];

export default function FilterPanel({
  filters,
  onChange,
  onReset,
  onSubmit,
  onFindNearby,
  locating = false
}) {
  const districtOptions = useMemo(() => getDistrictOptions(filters.city), [filters.city]);
  const pickupAreaOptions = useMemo(() => getPickupAreaOptions(filters.city), [filters.city]);

  const setField = (field, value) => onChange((prev) => ({ ...prev, [field]: value }));

  const handleCityChange = (city) => {
    onChange((prev) => ({
      ...prev,
      city,
      district: '',
      pickup_area: ''
    }));
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <SlidersHorizontal className="h-4 w-4 text-cyan-300" />
          <p className="text-sm font-semibold">Bộ lọc phương tiện</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFindNearby}
            disabled={locating}
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Crosshair className="h-3.5 w-3.5" />
            {locating ? 'Đang lấy vị trí...' : 'Tìm gần tôi'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-cyan-300 transition hover:text-cyan-200"
          >
            Đặt lại
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-300">Tìm kiếm</span>
          <div className="flex items-center rounded-xl border border-white/10 bg-slate-950/50 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={filters.q || ''}
              onChange={(event) => setField('q', event.target.value)}
              placeholder="Hãng, mẫu, biển số"
              className="w-full bg-transparent px-2 py-2 text-sm text-white outline-none"
            />
          </div>
        </label>

        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Thành phố</span>
            <select
              value={filters.city || ''}
              onChange={(event) => handleCityChange(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              {CITY_OPTIONS.map((item) => (
                <option key={item.value || 'ALL_CITY'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Quận/Huyện</span>
            <select
              value={filters.district || ''}
              onChange={(event) => setField('district', event.target.value)}
              disabled={!filters.city}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {districtOptions.map((item) => (
                <option key={item.value || 'ALL_DISTRICT'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Khu vực nhận xe</span>
            <select
              value={filters.pickup_area || ''}
              onChange={(event) => setField('pickup_area', event.target.value)}
              disabled={!filters.city}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pickupAreaOptions.map((item) => (
                <option key={item.value || 'ALL_AREA'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Bán kính tìm gần (km)</span>
            <input
              type="number"
              min="1"
              max="100"
              value={filters.radius_km || '10'}
              onChange={(event) => setField('radius_km', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Loại phương tiện</span>
            <select
              value={filters.vehicle_type || ''}
              onChange={(event) => setField('vehicle_type', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Tất cả</option>
              {VEHICLE_TYPE_FILTER_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Trạng thái</span>
            <select
              value={filters.status || ''}
              onChange={(event) => setField('status', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Tất cả</option>
              {VEHICLE_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Nhiên liệu</span>
            <select
              value={filters.fuel_type || ''}
              onChange={(event) => setField('fuel_type', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Tất cả</option>
              {FUEL_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Hộp số</span>
            <select
              value={filters.transmission || ''}
              onChange={(event) => setField('transmission', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Tất cả</option>
              {TRANSMISSION_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Số ghế tối thiểu</span>
            <input
              type="number"
              min="1"
              value={filters.min_seats || ''}
              onChange={(event) => setField('min_seats', event.target.value)}
              placeholder="4"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Chế độ lái</span>
            <select
              value={filters.driver_mode || ''}
              onChange={(event) => setField('driver_mode', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              {DRIVER_MODE_OPTIONS.map((item) => (
                <option key={item.value || 'ALL'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Giá từ</span>
            <input
              type="number"
              value={filters.min_price || ''}
              onChange={(event) => setField('min_price', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Giá đến</span>
            <input
              type="number"
              value={filters.max_price || ''}
              onChange={(event) => setField('max_price', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Ngày nhận xe</span>
            <input
              type="date"
              value={filters.start_date || ''}
              onChange={(event) => setField('start_date', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Ngày trả xe</span>
            <input
              type="date"
              value={filters.end_date || ''}
              onChange={(event) => setField('end_date', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-300">Đánh giá tối thiểu</span>
            <select
              value={filters.rating || ''}
              onChange={(event) => setField('rating', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Tất cả</option>
              <option value="4.5">Từ 4.5 sao</option>
              <option value="4">Từ 4 sao</option>
              <option value="3.5">Từ 3.5 sao</option>
            </select>
          </label>
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] hover:bg-cyan-400"
      >
        Áp dụng bộ lọc
      </button>
    </form>
  );
}
