import React, { useEffect, useState } from 'react';
import { CreditCard, FileText } from 'lucide-react';
import { paymentApi, rentalApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import SectionHeader from '../../components/common/SectionHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { compactId, formatCurrency, formatDate, formatDateTime, pickArray } from '../../utils/formatters';
import { normalizeRentalStatus } from '../../utils/rentalBill';

const OWNER_PAYMENT_FALLBACK_STATUSES = new Set([
  'APPROVED',
  'ACTIVE',
  'RETURN_REQUESTED',
  'COMPLETED'
]);

function deriveOwnerPaymentRowsFromRentals(rentals = []) {
  return rentals
    .filter((item) => OWNER_PAYMENT_FALLBACK_STATUSES.has(normalizeRentalStatus(item?.status)))
    .map((item) => ({
      id: `owner-fallback-${item?._id}`,
      _id: item?._id,
      payment_type: 'RENTAL_INCOME',
      amount: Number(item?.total_amount || item?.pricing_snapshot?.total_amount || 0),
      status: normalizeRentalStatus(item?.status) === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      created_at: item?.updated_at || item?.created_at,
      vehicle_name: `${item?.brand || item?.vehicle_snapshot?.brand || ''} ${item?.model || item?.vehicle_snapshot?.model || ''}`.trim(),
      rental_period: `${formatDate(item?.rental_start_date)} - ${formatDate(item?.rental_end_date)}`,
      source: 'RENTAL_FALLBACK'
    }))
    .sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );
}

export default function OwnerPaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [paymentRes, rentalRes] = await Promise.allSettled([
          paymentApi.getOwnerPayments(),
          rentalApi.getOwnerRequests()
        ]);

        const paymentRows = paymentRes.status === 'fulfilled' ? pickArray(paymentRes.value?.data) : [];
        const rentalRows = rentalRes.status === 'fulfilled' ? pickArray(rentalRes.value?.data) : [];

        if (paymentRows.length > 0) {
          setPayments(paymentRows);
          setUsingFallback(false);
        } else {
          const fallbackRows = deriveOwnerPaymentRowsFromRentals(rentalRows);
          setPayments(fallbackRows);
          setUsingFallback(fallbackRows.length > 0);
        }
      } catch {
        setPayments([]);
        setUsingFallback(false);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const columns = [
    {
      key: 'id',
      title: 'Mã giao dịch',
      render: (row) => <span className="font-medium text-white">#{compactId(row._id)}</span>
    },
    {
      key: 'vehicle',
      title: 'Phương tiện',
      render: (row) => (
        <div>
          <p className="font-medium text-white">{row.vehicle_name || 'Chưa cập nhật'}</p>
          {row.rental_period ? <p className="text-xs text-slate-400">{row.rental_period}</p> : null}
        </div>
      )
    },
    {
      key: 'type',
      title: 'Loại thanh toán',
      render: (row) => row.payment_type || '--'
    },
    {
      key: 'amount',
      title: 'Số tiền',
      render: (row) => <span className="font-semibold text-cyan-300">{formatCurrency(row.amount)}</span>
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
    }
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Thanh toán nhận được"
        subtitle="Theo dõi dòng tiền nhận từ các hợp đồng cho thuê đã phát sinh."
      />

      {!loading && usingFallback ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="inline-flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4" />
            Đang hiển thị dữ liệu tạm từ yêu cầu thuê vì chưa có giao dịch payment chính thức.
          </p>
        </div>
      ) : null}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Chưa có giao dịch nhận tiền"
          description="Các khoản thanh toán nhận được sẽ hiển thị khi có hợp đồng thuê hoạt động."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={payments}
          loading={loading}
          emptyTitle="Chưa có giao dịch nhận tiền"
          emptyDescription="Không có giao dịch nào."
        />
      )}
    </div>
  );
}
