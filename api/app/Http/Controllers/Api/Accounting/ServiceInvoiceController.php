<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Customer;
use App\Models\ServiceInvoice;
use App\Models\Voucher;
use App\Support\Activity;
use App\Support\Finance;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Service invoices to external customers (hall rental, summer courses, …) + their collections. */
class ServiceInvoiceController extends ResourceController
{
    protected string $model = ServiceInvoice::class;

    protected array $search = ['number', 'customer_name', 'customer.name'];

    protected array $filters = ['status', 'customer_id'];

    protected array $with = ['customer:id,name,phone'];

    protected array $showWith = ['items', 'payments'];

    protected ?string $dateColumn = 'date';

    protected string $label = 'فاتورة خدمات';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'customer_id'         => ['nullable', 'integer', $this->owned('customers')],
            'customer_name'       => ['nullable', 'string', 'max:255'],
            'date'                => ['required', 'date'],
            'due_date'            => ['nullable', 'date'],
            'discount'            => ['nullable', 'numeric', 'min:0'],
            'tax_rate'            => ['nullable', 'numeric', 'min:0', 'max:100'],
            'notes'               => ['nullable', 'string'],
            'items'               => ['required', 'array', 'min:1'],
            'items.*.description' => ['required', 'string', 'max:255'],
            'items.*.qty'         => ['required', 'numeric', 'min:0.01'],
            'items.*.price'       => ['required', 'numeric', 'min:0'],
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request, null));
        $inv = DB::transaction(function () use ($data) {
            $inv = new ServiceInvoice(['number' => Numbering::next(ServiceInvoice::class, 'INV-'), 'status' => 'issued']);
            $this->fillInvoice($inv, $data);

            return $inv;
        });
        Activity::log('create', $inv, 'فاتورة خدمات: '.$inv->number);

        return response()->json($inv->fresh($this->with), 201);
    }

    public function update(Request $request, $id)
    {
        $inv = $this->find($id);
        if ((float) $inv->paid > 0 || $inv->status === 'cancelled') {
            return response()->json(['message' => 'لا يمكن تعديل فاتورة عليها دفعات أو ملغاة.'], 422);
        }
        $data = $request->validate($this->rules($request, $inv));
        DB::transaction(fn () => $this->fillInvoice($inv, $data));

        return response()->json($inv->fresh($this->with));
    }

    private function fillInvoice(ServiceInvoice $inv, array $data): void
    {
        $subtotal = 0;
        foreach ($data['items'] as $it) {
            $subtotal += (float) $it['qty'] * (float) $it['price'];
        }
        $discount = min($subtotal, (float) ($data['discount'] ?? 0));
        $tax = Finance::r(($subtotal - $discount) * (float) ($data['tax_rate'] ?? 0) / 100);
        $inv->fill([
            'customer_id'   => $data['customer_id'] ?? null,
            'customer_name' => $data['customer_name'] ?? (! empty($data['customer_id']) ? Customer::find($data['customer_id'])?->name : null),
            'date'          => $data['date'],
            'due_date'      => $data['due_date'] ?? null,
            'subtotal'      => Finance::r($subtotal),
            'discount'      => Finance::r($discount),
            'tax_rate'      => $data['tax_rate'] ?? 0,
            'tax'           => $tax,
            'total'         => Finance::r($subtotal - $discount + $tax),
            'notes'         => $data['notes'] ?? null,
        ]);
        $inv->save();
        $inv->items()->delete();
        foreach ($data['items'] as $it) {
            $inv->items()->create(['description' => $it['description'], 'qty' => $it['qty'], 'price' => $it['price'], 'total' => Finance::r((float) $it['qty'] * (float) $it['price'])]);
        }
    }

    public function pay(Request $request, $id)
    {
        $inv = $this->find($id);
        $data = $request->validate([
            'amount'          => ['required', 'numeric', 'min:0.001'],
            'date'            => ['nullable', 'date'],
            'method'          => ['nullable', 'in:cash,bank,card,cheque'],
            'cash_account_id' => ['nullable', 'integer', $this->owned('cash_accounts')],
            'reference'       => ['nullable', 'string', 'max:120'],
        ]);
        if ($inv->status === 'cancelled' || (float) $data['amount'] > (float) $inv->total - (float) $inv->paid + 0.0005) {
            return response()->json(['message' => 'المبلغ أكبر من المتبقي أو الفاتورة ملغاة.'], 422);
        }
        $v = Finance::voucher('receipt', [
            'date'            => $data['date'] ?? now()->toDateString(),
            'amount'          => Finance::r((float) $data['amount']),
            'cash_account_id' => $data['cash_account_id'] ?? null,
            'method'          => $data['method'] ?? 'cash',
            'reference'       => $data['reference'] ?? null,
            'category'        => 'service',
            'party_type'      => 'customer',
            'party_id'        => $inv->customer_id,
            'party_name'      => $inv->customer_name,
            'party_name_en'   => $inv->customer?->name_en ?: $inv->customer_name,
            'source_type'     => 'service_invoice',
            'source_id'       => $inv->id,
            'description'     => 'تحصيل فاتورة خدمات '.$inv->number,
            'description_en'  => 'Service invoice collection '.$inv->number,
        ]);
        Finance::syncInvoice($inv);
        Activity::log('payment', $inv, 'سند قبض '.$v->number.' لفاتورة '.$inv->number);

        return response()->json(['message' => 'تم تسجيل التحصيل — سند قبض '.$v->number, 'voucher' => $v], 201);
    }

    public function cancel(Request $request, $id)
    {
        $inv = $this->find($id);
        if ((float) $inv->paid > 0) {
            return response()->json(['message' => 'لا يمكن إلغاء فاتورة عليها تحصيلات.'], 422);
        }
        $inv->update(['status' => 'cancelled']);

        return response()->json(['message' => 'تم إلغاء الفاتورة.']);
    }

    protected function beforeDelete(Model $record): void
    {
        Voucher::where('source_type', 'service_invoice')->where('source_id', $record->id)->get()->each->delete(); // per-model → sync tombstones
    }
}
