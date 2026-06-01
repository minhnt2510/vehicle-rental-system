import {
  contractApi,
  disputeApi,
  ownerApplicationApi,
  paymentApi,
  rentalApi,
  statisticApi,
  userApi,
  vehicleApi
} from '../api';
import { pickArray } from '../utils/formatters';

function dedupeById(rows = []) {
  const map = new Map();
  rows.forEach((item) => {
    const key = String(item?._id || item?.id || '');
    if (!key) return;
    map.set(key, item);
  });
  return Array.from(map.values());
}

async function fromSingleApi(loader) {
  try {
    const response = await loader();
    return {
      rows: pickArray(response.data),
      source: 'api',
      fallback: false,
      error: ''
    };
  } catch (error) {
    return {
      rows: [],
      source: 'api_error',
      fallback: false,
      error: error?.response?.data?.error || error?.message || 'API lỗi'
    };
  }
}

async function fromMultipleApi(loaders = []) {
  const results = await Promise.allSettled(loaders.map((loader) => loader()));
  const fulfilledRows = results
    .filter((item) => item.status === 'fulfilled')
    .flatMap((item) => pickArray(item.value.data));

  if (results.some((item) => item.status === 'fulfilled')) {
    return {
      rows: dedupeById(fulfilledRows),
      source: 'api',
      fallback: false,
      error: ''
    };
  }

  const firstError = results.find((item) => item.status === 'rejected')?.reason;
  return {
    rows: [],
    source: 'api_error',
    fallback: false,
    error: firstError?.response?.data?.error || firstError?.message || 'API lỗi'
  };
}

export async function getAdminUsersData() {
  return fromSingleApi(() => userApi.getAdminUsers({ page: 1, limit: 120 }));
}

export async function getAdminOwnerApplicationsData(statusFilter = 'ALL') {
  const params = statusFilter === 'ALL' ? {} : { status: statusFilter };
  return fromSingleApi(() => ownerApplicationApi.getOwnerApplications(params));
}

export async function getAdminVehiclesData() {
  return fromSingleApi(
    () =>
      vehicleApi.getAdminVehicles
        ? vehicleApi.getAdminVehicles({ page: 1, limit: 120 })
        : vehicleApi.getAvailable({ page: 1, limit: 120 })
  );
}

export async function getAdminRentalsData() {
  return fromSingleApi(() => rentalApi.getAdminRentals({ limit: 300 }));
}

export async function getAdminContractsData() {
  return fromSingleApi(() => contractApi.getAdminContracts({ limit: 300 }));
}

export async function getAdminPaymentsData() {
  return fromSingleApi(() => paymentApi.getAdminPayments({ limit: 300 }));
}

export async function getAdminDisputesData() {
  return fromSingleApi(() => disputeApi.getAdminDisputes({ limit: 300 }));
}

function monthLabel(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return `${date.getMonth() + 1}/${date.getFullYear()}`;
}

function buildRevenueFromPayments(payments = []) {
  const map = new Map();
  payments.forEach((payment) => {
    const created = payment.created_at || payment.updated_at;
    const key = monthLabel(created);
    const current = map.get(key) || 0;
    const amount = Number(payment.amount || 0);
    if (String(payment.status || '').toUpperCase() === 'COMPLETED') {
      map.set(key, current + amount);
    }
  });

  return Array.from(map.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => {
      const [am, ay] = a.month.split('/').map(Number);
      const [bm, by] = b.month.split('/').map(Number);
      return ay === by ? am - bm : ay - by;
    })
    .slice(-6);
}

function buildTopVehicles(vehicles = [], rentals = []) {
  const countMap = new Map();
  rentals.forEach((rental) => {
    const key = String(rental.vehicle_id || '');
    if (!key) return;
    countMap.set(key, (countMap.get(key) || 0) + 1);
  });

  return vehicles
    .map((vehicle) => ({
      ...vehicle,
      vehicle_id: vehicle._id,
      rental_count: countMap.get(String(vehicle._id || '')) || Number(vehicle.completed_trips || 0)
    }))
    .sort((a, b) => Number(b.rental_count || 0) - Number(a.rental_count || 0))
    .slice(0, 6);
}

export async function getAdminDashboardData() {
  const [usersRes, ownerAppRes, vehiclesRes, rentalsRes, contractsRes, paymentsRes, disputesRes] =
    await Promise.all([
      getAdminUsersData(),
      getAdminOwnerApplicationsData('ALL'),
      getAdminVehiclesData(),
      getAdminRentalsData(),
      getAdminContractsData(),
      getAdminPaymentsData(),
      getAdminDisputesData()
    ]);

  const users = usersRes.rows;
  const ownerApplications = ownerAppRes.rows;
  const vehicles = vehiclesRes.rows;
  const rentals = rentalsRes.rows;
  const contracts = contractsRes.rows;
  const payments = paymentsRes.rows;
  const disputes = disputesRes.rows;

  const totalUsers = users.length;
  const totalRenters = users.filter((item) => String(item.role || '').toUpperCase() === 'USER').length;
  const approvedOwners = users.filter((item) => String(item.owner_status || '').toUpperCase() === 'APPROVED').length;
  const pendingOwnerApplications = ownerApplications.filter(
    (item) => String(item.status || '').toUpperCase() === 'PENDING'
  ).length;

  const pendingRentals = rentals.filter((item) => String(item.status || '').toUpperCase() === 'PENDING').length;
  const activeContracts = contracts.filter((item) => ['ACTIVE', 'APPROVED'].includes(String(item.status || '').toUpperCase())).length;
  const pendingDisputes = disputes.filter((item) => ['PENDING', 'REVIEWING'].includes(String(item.status || '').toUpperCase())).length;

  const completedPayments = payments.filter((item) => String(item.status || '').toUpperCase() === 'COMPLETED');
  const totalPayments = completedPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const systemFeeRevenue = Math.round(totalPayments * 0.04);

  const dashboardApi = await statisticApi
    .getDashboard()
    .then((res) => ({ ok: true, data: res.data }))
    .catch(() => ({ ok: false, data: null }));

  const revenueApi = await statisticApi
    .getRevenueByMonth(6)
    .then((res) => pickArray(res.data))
    .catch(() => []);

  const revenueByMonth = revenueApi.length
    ? revenueApi.map((item, idx) => ({
        month: item.month || item.label || `M${idx + 1}`,
        value: Number(item.revenue || item.value || 0)
      }))
    : buildRevenueFromPayments(payments);

  const topVehiclesApi = await statisticApi
    .getTopVehicles(6)
    .then((res) => pickArray(res.data))
    .catch(() => []);

  const topVehicles = topVehiclesApi.length ? topVehiclesApi : buildTopVehicles(vehicles, rentals);

  const recentRentals = [...rentals]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 6);

  const hasApiError = [usersRes, ownerAppRes, vehiclesRes, rentalsRes, contractsRes, paymentsRes, disputesRes].some(
    (item) => Boolean(item.error)
  );

  return {
    source: hasApiError ? 'api_error' : 'api',
    fallback: false,
    error: [
      usersRes.error,
      ownerAppRes.error,
      vehiclesRes.error,
      rentalsRes.error,
      contractsRes.error,
      paymentsRes.error,
      disputesRes.error
    ]
      .filter(Boolean)
      .join(' | '),
    metrics: {
      totalUsers: dashboardApi.data?.total_users ?? totalUsers,
      totalRenters,
      approvedOwners,
      pendingOwnerApplications,
      totalVehicles: dashboardApi.data?.total_vehicles ?? vehicles.length,
      pendingRentals,
      activeContracts,
      totalPayments: dashboardApi.data?.total_revenue ?? totalPayments,
      systemFeeRevenue: dashboardApi.data?.system_fee_revenue ?? systemFeeRevenue,
      pendingDisputes: dashboardApi.data?.pending_disputes ?? pendingDisputes
    },
    revenueByMonth,
    topVehicles,
    pendingDisputesList: disputes
      .filter((item) => ['PENDING', 'REVIEWING'].includes(String(item.status || '').toUpperCase()))
      .slice(0, 6),
    recentRentals,
    collections: {
      users,
      ownerApplications,
      vehicles,
      rentals,
      contracts,
      payments,
      disputes
    }
  };
}
