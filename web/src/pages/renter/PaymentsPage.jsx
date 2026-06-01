import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, FileText } from 'lucide-react';
import { paymentApi, rentalApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import SectionHeader from '../../components/common/SectionHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { useToast } from '../../context/ToastContext';
import {
  compactId,
  formatCurrency,
  formatDate,
  formatDateTime,
  pickArray
} from '../../utils/formatters';
import { getRentalBillPayload, normalizeRentalStatus } from '../../utils/rentalBill';

const FALLBACK_RENTAL_STATUSES = new Set([
  'PENDING',
  'APPROVED',
  'ACTIVE',
  'RETURN_REQUESTED',
  'COMPLETED',
  'DISPUTED'
]);

function mapRentalStatusToPaymentStatus(status) {
  const normalized = normalizeRentalStatus(status);
  if (normalized === 'PENDING' || normalized === 'APPROVED') return 'PENDING';
  if (normalized === 'DISPUTED') return 'DISPUTED';
  return 'PAID';
}

function derivePaymentRowsFromRentals(rentals = []) {
  return rentals
    .filter((item) => FALLBACK_RENTAL_STATUSES.has(normalizeRentalStatus(item?.status)))
    .map((item) => {
      const bill = getRentalBillPayload(item);
      const title = `${bill?.vehicle?.brand || ''} ${bill?.vehicle?.model || ''}`.trim();

      return {
        id: `fallback-${item?._id}`,
        _id: item?._id,
        payment_type: 'RENTAL_BILL',
        amount: Number(bill?.pricing?.total_amount || 0),
        status: mapRentalStatusToPaymentStatus(item?.status),
        created_at: item?.updated_at || item?.created_at,
        vehicle_name: title || `Xe #${compactId(item?.vehicle_id)}`,
        rental_period: `${formatDate(item?.rental_start_date)} - ${formatDate(item?.rental_end_date)}`,
        source: 'RENTAL_FALLBACK'
      };
    })
    .sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );
}

export default function PaymentsPage() {
  const { pushToast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [processingPaymentId, setProcessingPaymentId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [paymentResponse, rentalResponse] = await Promise.allSettled([
        paymentApi.getRenterPayments(),
        rentalApi.getRenterRequests()
      ]);

      const paymentRows =
        paymentResponse.status === 'fulfilled' ? pickArray(paymentResponse.value?.data) : [];
      const rentals =
        rentalResponse.status === 'fulfilled' ? pickArray(rentalResponse.value?.data) : [];

      if (paymentRows.length) {
        setPayments(paymentRows);
        setUsingFallback(false);
      } else {
        const derivedRows = derivePaymentRowsFromRentals(rentals);
        setPayments(derivedRows);
        setUsingFallback(derivedRows.length > 0);
      }
    } catch {
      setPayments([]);
      setUsingFallback(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProcessPayment = async (row) => {
    const paymentId = String(row?._id || row?.id || '');
    if (!paymentId || String(row?.source || '') === 'RENTAL_FALLBACK') {
      pushToast({
        tone: 'info',
        title: 'Chưa thể thanh toán trực tiếp',
        message:
          'Bill này đang ở chế độ dự phòng. Vui lòng nhờ chủ xe duyệt lại để tạo giao dịch thanh toán chính thức.'
      });
      return;
    }

    setProcessingPaymentId(paymentId);
    try {
      await paymentApi.process(paymentId, {
        transaction_id: `CLIENT-${Date.now()}`
      });
      pushToast({
        tone: 'success',
        title: 'Thanh toán thành công',
        message: 'Giao dịch của bạn đã được ghi nhận.'
      });
      await loadData();
    } catch (error) {
      pushToast({
        tone: 'error',
        title: 'Thanh toán thất bại',
        message:
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          'Không thể xử lý thanh toán lúc này.'
      });
    } finally {
      setProcessingPaymentId('');
    }
  };

  const totalAmount = useMemo(
    () => payments.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [payments]
  );

  const columns = [
    {
      key: 'id',
      title: 'Mã thanh toán',
      render: (row) => (
        <span className="font-medium text-white">
          #{compactId(row._id || row.id)}
        </span>
      )
    },
    {
      key: 'vehicle',
      title: 'Phương tiện',
      render: (row) => (
        <div>
          <p className="font-medium text-white">{row.vehicle_name || 'Chưa cập nhật'}</p>
          {row.rental_period ? (
            <p className="text-xs text-slate-400">{row.rental_period}</p>
          ) : null}
        </div>
      )
    },
    {
      key: 'type',
      title: 'Loại',
      render: (row) => row.payment_type || '--'
    },
    {
      key: 'amount',
      title: 'Số tiền',
      render: (row) => (
        <span className="font-semibold text-cyan-300">
          {formatCurrency(row.amount)}
        </span>
      )
    },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (row) => <StatusBadge status={row.status || 'PENDING'} />
    },
    {
      key: 'created',
      title: 'Thời gian tạo',
      render: (row) => formatDateTime(row.created_at)
    },
    {
      key: 'action',
      title: 'Thao tác',
      render: (row) => {
        const status = String(row?.status || '').toUpperCase();
        const paymentId = String(row?._id || row?.id || '');
        const isFallback = String(row?.source || '') === 'RENTAL_FALLBACK';
        const isProcessing = processingPaymentId === paymentId;

        if (status !== 'PENDING') {
          return <span className="text-xs text-slate-400">--</span>;
        }

        return (
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleProcessPayment(row)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isFallback
                ? 'border border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {isFallback ? 'Bill tạm' : isProcessing ? 'Đang xử lý...' : 'Thanh toán ngay'}
          </button>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Thanh toán của tôi"
        subtitle="Theo dõi tiền cọc, phí thuê và hoàn tiền cho các hợp đồng thuê xe của bạn."
      />

      {!loading && payments.length ? (
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4" />
              Tổng bill đang hiển thị: {payments.length}
            </p>
            <p className="font-semibold text-white">Tổng giá trị: {formatCurrency(totalAmount)}</p>
          </div>
          {usingFallback ? (
            <p className="mt-2 text-xs text-cyan-100/90">
              Hệ thống đang hiển thị bill suy ra từ yêu cầu thuê vì cổng thanh toán chưa trả giao dịch.
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Chưa có giao dịch thanh toán"
          description="Các giao dịch sẽ hiển thị khi hợp đồng thuê xe của bạn được kích hoạt."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={payments}
          loading={loading}
          emptyTitle="Chưa có lịch sử thanh toán"
          emptyDescription="Chưa có giao dịch nào."
        />
      )}
    </div>
  );
}
