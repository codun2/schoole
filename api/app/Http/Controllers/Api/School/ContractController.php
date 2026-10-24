<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\AcademicYear;
use App\Models\Contract;
use App\Models\Student;
use App\Models\Voucher;
use App\Support\Activity;
use App\Support\Finance;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Student enrolment contracts: fee lines (+ optional bus) − discount + tax,
 * split into monthly installments. Lifecycle: draft → active → completed,
 * or cancelled. Payments are receipt vouchers linked to the contract.
 */
class ContractController extends ResourceController
{
    protected string $model = Contract::class;

    protected array $search = ['number', 'student.name', 'student.national_id', 'guardian.phone', 'guardian.name'];

    protected array $filters = ['status', 'grade_id', 'section_id', 'student_id', 'guardian_id'];

    protected array $with = ['student:id,name,national_id', 'guardian:id,name,phone', 'grade:id,name_ar', 'section:id,name', 'year:id,name'];

    protected array $showWith = ['items', 'installments', 'payments', 'bus:id,number,price'];

    protected array $sortable = ['id', 'date', 'total', 'remaining'];

    protected ?string $dateColumn = 'date';

    protected bool $yearScoped = true;

    protected string $label = 'عقد';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'student_id'         => ['required', 'integer', $this->owned('students')],
            'date'               => ['required', 'date'],
            'items'              => ['required', 'array', 'min:1'],
            'items.*.fee_item_id' => ['nullable', 'integer'],
            'items.*.name'       => ['required', 'string', 'max:255'],
            'items.*.amount'     => ['required', 'numeric', 'min:0'],
            'bus_id'             => ['nullable', 'integer', $this->owned('buses')],
            'discount_type'      => ['nullable', 'in:fixed,percent'],
            'discount_value'     => ['nullable', 'numeric', 'min:0'],
            'discount_reason'    => ['nullable', 'string', 'max:255'],
            'tax_rate'           => ['nullable', 'numeric', 'min:0', 'max:100'],
            'installments_count' => ['required', 'integer', 'min:1', 'max:24'],
            'first_due_date'     => ['nullable', 'date'],
            'notes'              => ['nullable', 'string'],
            'activate'           => ['boolean'],
        ];
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        if ($request->boolean('has_remaining')) {
            $query->where('remaining', '>', 0)->where('status', 'active');
        }
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules($request, null));
        $student = Student::findOrFail($data['student_id']);
        // one live contract per student per academic year (cancelled ones don't count)
        if (Contract::where('student_id', $student->id)->where('academic_year_id', $student->academic_year_id)->where('status', '!=', 'cancelled')->exists()) {
            return response()->json(['message' => 'يوجد عقد لهذا الطالب في السنة الدراسية الحالية — عدّله أو ألغِه بدلاً من إنشاء عقد جديد.'], 422);
        }
        $contract = DB::transaction(function () use ($data, $request, $student) {
            $year = AcademicYear::find($student->academic_year_id);
            $c = new Contract;
            $c->academic_year_id = $student->academic_year_id;
            $c->number = Numbering::next(Contract::class, ($request->user()->company->contract_prefix ?: 'SCH').'-'.substr((string) ($year?->name ?? date('Y')), 0, 4).'-', 4);
            $c->created_by = $request->user()->id;
            $this->fillContract($c, $student, $data);

            return $c;
        });
        Activity::log('create', $contract, 'عقد: '.$contract->number);

        return response()->json($contract->fresh($this->with), 201);
    }

    public function update(Request $request, $id)
    {
        $c = $this->find($id);
        if ($c->status !== 'draft') {
            return response()->json(['message' => 'لا يمكن تعديل عقد بعد تفعيله — يمكن إلغاؤه وإنشاء عقد جديد.'], 422);
        }
        $data = $request->validate($this->rules($request, $c));
        DB::transaction(fn () => $this->fillContract($c, Student::findOrFail($data['student_id']), $data));
        Activity::log('update', $c, 'عقد: '.$c->number);

        return response()->json($c->fresh($this->with));
    }

    private function fillContract(Contract $c, Student $student, array $data): void
    {
        $items = $data['items'];
        if (! empty($data['bus_id'])) {
            $bus = \App\Models\Bus::find($data['bus_id']);
            if ($bus && ! collect($items)->contains(fn ($i) => str_contains($i['name'], 'حافلة'))) {
                $items[] = ['fee_item_id' => null, 'name' => 'رسوم الحافلة ('.$bus->number.')', 'amount' => (float) $bus->price];
            }
        }

        $c->fill([
            'student_id'         => $student->id,
            'guardian_id'        => $student->guardian_id,
            'grade_id'           => $student->grade_id,
            'section_id'         => $student->section_id,
            'bus_id'             => $data['bus_id'] ?? null,
            'date'               => $data['date'],
            'discount_type'      => $data['discount_type'] ?? 'fixed',
            'discount_value'     => $data['discount_value'] ?? 0,
            'discount_reason'    => $data['discount_reason'] ?? null,
            'tax_rate'           => $data['tax_rate'] ?? 0,
            'installments_count' => $data['installments_count'],
            'first_due_date'     => $data['first_due_date'] ?? $data['date'],
            'notes'              => $data['notes'] ?? null,
        ]);
        $c->status = $c->status ?: 'draft';
        Finance::computeContract($c, $items);
        $c->save();

        $c->items()->delete();
        foreach ($items as $it) {
            $c->items()->create(['fee_item_id' => $it['fee_item_id'] ?? null, 'name' => $it['name'], 'amount' => Finance::r((float) $it['amount'])]);
        }
        Finance::buildInstallments($c);

        if (! empty($data['activate'])) {
            $this->doActivate($c);
        }
        if (! empty($data['bus_id']) && ! $student->bus_id) {
            $student->update(['bus_id' => $data['bus_id']]);
        }
    }

    public function activate(Request $request, $id)
    {
        $c = $this->find($id);
        if ($c->status !== 'draft') {
            return response()->json(['message' => 'العقد ليس مسودة.'], 422);
        }
        $this->doActivate($c);
        Activity::log('activate', $c, 'تفعيل عقد: '.$c->number);

        return response()->json(['message' => 'تم تفعيل العقد.']);
    }

    private function doActivate(Contract $c): void
    {
        $c->status = (float) $c->total <= 0 ? 'completed' : 'active';
        $c->save();
        Finance::syncContract($c);
    }

    public function cancel(Request $request, $id)
    {
        $c = $this->find($id);
        if (Voucher::where('source_type', 'contract')->where('source_id', $c->id)->exists()) {
            return response()->json(['message' => 'لا يمكن إلغاء عقد عليه دفعات — احذف الدفعات أولاً.'], 422);
        }
        $c->update(['status' => 'cancelled']);
        Activity::log('cancel', $c, 'إلغاء عقد: '.$c->number);

        return response()->json(['message' => 'تم إلغاء العقد.']);
    }

    public function pay(Request $request, $id)
    {
        $c = $this->find($id);
        $data = $request->validate([
            'amount'          => ['required', 'numeric', 'min:0.001'],
            'date'            => ['nullable', 'date'],
            'method'          => ['nullable', 'in:cash,bank,card,cheque'],
            'cash_account_id' => ['nullable', 'integer', $this->owned('cash_accounts')],
            'reference'       => ['nullable', 'string', 'max:120'],
            'description'     => ['nullable', 'string', 'max:255'],
        ]);
        $v = Finance::payContract($c, $data);
        Activity::log('payment', $c, 'سند قبض '.$v->number.' على عقد '.$c->number.' بمبلغ '.$v->amount);

        return response()->json(['message' => 'تم تسجيل الدفعة — سند رقم '.$v->number, 'voucher' => $v], 201);
    }

    public function deletePayment(Request $request, $id, $voucherId)
    {
        $c = $this->find($id);
        $v = Voucher::where('source_type', 'contract')->where('source_id', $c->id)->findOrFail($voucherId);
        $v->delete();
        Finance::syncContract($c->fresh());
        Activity::log('delete', $c, 'حذف سند '.$v->number.' من عقد '.$c->number);

        return response()->json(['message' => 'تم حذف الدفعة.']);
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->status !== 'draft' && $record->status !== 'cancelled' ? 'لا يمكن حذف عقد مفعّل — قم بإلغائه أولاً.' : null;
    }
}
