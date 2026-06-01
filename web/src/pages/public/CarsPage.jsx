import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CarFront } from "lucide-react";
import { vehicleApi } from "../../api";
import CarCard from "../../components/car/CarCard";
import FilterPanel from "../../components/car/FilterPanel";
import EmptyState from "../../components/common/EmptyState";
import LoadingSkeleton from "../../components/common/LoadingSkeleton";
import SectionHeader from "../../components/common/SectionHeader";
import {
  VEHICLE_TYPE_FILTER_OPTIONS,
  matchesVehicleTypeFilter,
  normalizeVehicleTypeValue,
  toBackendVehicleTypeFilter,
} from "../../constants/vehicle";
import { normalizeLocationText } from "../../constants/locationOptions";
import { pickArray } from "../../utils/formatters";

const defaultFilters = {
  q: "",
  city: "",
  district: "",
  pickup_area: "",
  latitude: "",
  longitude: "",
  radius_km: "10",
  vehicle_type: "",
  fuel_type: "",
  transmission: "",
  min_seats: "",
  min_price: "",
  max_price: "",
  start_date: "",
  end_date: "",
  rating: "",
  driver_mode: "",
  status: "",
};

function toLocationBlob(vehicle) {
  const raw = [
    vehicle.city,
    vehicle.district,
    vehicle.allowed_region,
    vehicle.location,
    vehicle.pickup_location,
    vehicle.return_location,
    vehicle.pickup_area,
    vehicle.address,
  ]
    .filter(Boolean)
    .join(" | ");
  return normalizeLocationText(raw);
}

function applyClientFilters(items, filters) {
  const q = normalizeLocationText(filters.q);
  const city = normalizeLocationText(filters.city);
  const district = normalizeLocationText(filters.district);
  const pickupArea = normalizeLocationText(filters.pickup_area);
  const vehicleType = normalizeVehicleTypeValue(filters.vehicle_type);
  const minSeats = Number(filters.min_seats || 0);
  const minPrice = Number(filters.min_price || 0);
  const maxPrice = Number(filters.max_price || 0);
  const minRating = Number(filters.rating || 0);
  const status = String(filters.status || "").toUpperCase();
  const fuel = String(filters.fuel_type || "").toUpperCase();
  const transmission = String(filters.transmission || "").toUpperCase();

  return items.filter((vehicle) => {
    const haystack = normalizeLocationText(
      `${vehicle.brand || ""} ${vehicle.model || ""} ${vehicle.license_plate || ""}`,
    );
    const locationBlob = toLocationBlob(vehicle);
    const sourceType = String(vehicle.vehicle_type || "").toUpperCase();
    const vehicleStatus = String(
      vehicle.status || (vehicle.is_available ? "AVAILABLE" : "PENDING"),
    ).toUpperCase();
    const rate = Number(vehicle.daily_rate || 0);
    const seats = Number(vehicle.seats || 0);
    const rating = Number(vehicle.rating || vehicle.average_rating || 0);

    if (q && !haystack.includes(q)) return false;
    if (city && !locationBlob.includes(city)) return false;
    if (district && !locationBlob.includes(district)) return false;
    if (pickupArea && !locationBlob.includes(pickupArea)) return false;
    if (vehicleType && !matchesVehicleTypeFilter(vehicle, vehicleType)) return false;
    if (fuel && String(vehicle.fuel_type || "").toUpperCase() !== fuel) return false;
    if (
      transmission &&
      String(vehicle.transmission || "").toUpperCase() !== transmission
    ) {
      return false;
    }
    if (status && vehicleStatus !== status) return false;
    if (minSeats && seats < minSeats) return false;
    if (minPrice && rate < minPrice) return false;
    if (maxPrice && rate > maxPrice) return false;
    if (minRating && rating < minRating) return false;

    const hasDriver =
      sourceType === "WITH_DRIVER_CAR" ||
      String(vehicle.driver_mode || "").toUpperCase() === "WITH_DRIVER" ||
      Boolean(vehicle.has_driver);
    if (filters.driver_mode === "WITH_DRIVER" && !hasDriver) return false;
    if (filters.driver_mode === "SELF_DRIVE" && hasDriver) return false;

    return true;
  });
}

export default function CarsPage({ detailBase = "/vehicles" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(defaultFilters);
  const [vehicles, setVehicles] = useState([]);
  const [allVehicles, setAllVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const incoming = { ...defaultFilters };
    Object.keys(defaultFilters).forEach((key) => {
      incoming[key] = searchParams.get(key) || "";
    });
    incoming.vehicle_type = normalizeVehicleTypeValue(incoming.vehicle_type);
    setFilters(incoming);
  }, [searchParams]);

  const fetchVehicles = async (nextFilters = filters) => {
    setLoading(true);
    setError("");
    try {
      const location = [nextFilters.city, nextFilters.district, nextFilters.pickup_area]
        .filter((item) => String(item || "").trim())
        .join(", ");

      const selectedVehicleType = normalizeVehicleTypeValue(nextFilters.vehicle_type);
      const params = {
        ...nextFilters,
        vehicle_type: toBackendVehicleTypeFilter(nextFilters.vehicle_type),
        fuel_type:
          nextFilters.fuel_type ||
          (selectedVehicleType === "ELECTRIC" ? "ELECTRIC" : undefined),
        location: location || undefined,
        latitude: nextFilters.latitude || undefined,
        longitude: nextFilters.longitude || undefined,
        radius_km: nextFilters.radius_km || undefined,
        page: 1,
        limit: 60,
        availability_date: nextFilters.start_date || undefined,
      };

      Object.keys(params).forEach((key) => {
        if (params[key] === "" || params[key] === undefined) delete params[key];
      });

      const response = params.q
        ? await vehicleApi.getSearchList(params)
        : await vehicleApi.getAvailable(params);

      const apiRows = pickArray(response.data);
      const filtered = applyClientFilters(apiRows, nextFilters);

      setAllVehicles(apiRows);
      setVehicles(filtered);
    } catch (err) {
      setAllVehicles([]);
      setVehicles([]);
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Không thể tải danh sách phương tiện từ API.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = useMemo(
    () =>
      Object.values(filters).filter((value) => String(value || "").trim()).length,
    [filters],
  );

  const handleApply = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      const normalizedValue =
        key === "vehicle_type" ? normalizeVehicleTypeValue(value) : value;
      if (String(normalizedValue || "").trim()) {
        params.set(key, normalizedValue);
      }
    });
    setSearchParams(params);
    setVehicles(applyClientFilters(allVehicles, filters));
  };

  const applyFiltersImmediately = (nextFilters) => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      const normalizedValue =
        key === "vehicle_type" ? normalizeVehicleTypeValue(value) : value;
      if (String(normalizedValue || "").trim()) {
        params.set(key, normalizedValue);
      }
    });
    setSearchParams(params);
    fetchVehicles(nextFilters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setSearchParams({});
    fetchVehicles(defaultFilters);
  };

  const handleFindNearby = () => {
    if (!navigator.geolocation) {
      setError("Trình duyệt hiện tại không hỗ trợ định vị.");
      return;
    }

    setLocating(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextFilters = {
          ...filters,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          radius_km: filters.radius_km || "10",
        };
        setFilters(nextFilters);
        applyFiltersImmediately(nextFilters);
        setLocating(false);
      },
      () => {
        setError("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền định vị.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const onSelectCategory = (type) => {
    const nextType = normalizeVehicleTypeValue(type);
    const nextFilters = {
      ...filters,
      vehicle_type: filters.vehicle_type === nextType ? "" : nextType,
    };
    setFilters(nextFilters);
    applyFiltersImmediately(nextFilters);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Marketplace phương tiện"
        subtitle="Giai đoạn đầu triển khai tại TP.HCM và Hà Nội, mở rộng theo khu vực khi nền tảng tăng trưởng thêm nguồn xe."
      />

      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
          Danh mục phương tiện
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {VEHICLE_TYPE_FILTER_OPTIONS.map((item) => {
            const selected =
              normalizeVehicleTypeValue(filters.vehicle_type) ===
              normalizeVehicleTypeValue(item.value);
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={selected}
                disabled={loading}
                onClick={() => onSelectCategory(item.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "bg-cyan-500 text-slate-950"
                    : "border border-white/15 text-slate-200 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={handleReset}
          onSubmit={handleApply}
          onFindNearby={handleFindNearby}
          locating={locating}
        />

        <section className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3">
            <p className="text-sm text-slate-200">
              {loading ? "Đang tải danh sách xe..." : `${vehicles.length} phương tiện phù hợp`}
            </p>
            <p className="text-xs text-slate-400">
              Bộ lọc đang áp dụng: {activeFilterCount}
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : vehicles.length === 0 ? (
            <EmptyState
              icon={CarFront}
              title="Không có phương tiện phù hợp với bộ lọc"
              description="Thử đổi thành phố/quận hoặc mở rộng điều kiện giá để xem thêm gợi ý phù hợp."
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {vehicles.map((vehicle) => (
                <CarCard
                  key={vehicle._id}
                  vehicle={vehicle}
                  to={`${detailBase}/${vehicle._id}`}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
