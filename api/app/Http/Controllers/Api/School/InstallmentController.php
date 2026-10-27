<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\Installment;
use App\Models\Voucher;
use Illuminate\Http\Request;

/** Installment schedule across all active contracts, and the tuition payments ledger. */
class InstallmentController extends Controller
{
    public function index(Request $request)
    {
        $yearId = $request->year && $request->year !== 'all' ? (int) $request->year : $request->user()->company->currentYearId();
        $today = now()->toDateString();

        $q = Installment::query()
            ->with(['student:id,name,name_en,grade_id,section_id', 'student.grade:id,name_ar,name_en', 'contract:id,number,guardian_id,status', 'contract.guardian:id,name,name_en,phone'])
            ->whereHas('contract', fn ($c) => $c->where('status', '!=', 'cancelled')->where('status', '!=', 'draft')
                ->when($yearId, fn ($w) => $w->where('academic_year_id', $yearId)));

        match ($request->state) {
            'overdue' => $q->where('status', '!=', 'paid')->whereDate('due_date', '<', $today),
            'due'     => $q->where('status', '!=', 'paid')->whereBetween('due_date', [$today, now()->addDays(30)->toDateString()]),
            'paid'    => $q->where('status', 'paid'),
            'unpaid'  => $q->where('status', '!=', 'paid'),
            default   => null,
        };
        if ($term = trim((string) $request->q)) {
            $q->where(fn ($w) => $w->whereHas('student', fn ($s) => $s->where('name', 'like', "%{$term}%"))
                ->orWhereHas('contract', fn ($c) => $c->where('number', 'like', "%{$term}%")));
        }
        if ($request->from) {
            $q->whereDate('due_date', '>=', $request->from);
        }
        if ($request->to) {
            $q->whereDate('due_date', '<=', $request->to);
        }
        if ($request->grade_id) {
            $q->whereHas('student', fn ($s) => $s->where('grade_id', $request->grade_id));
        }

        $totals = (clone $q)->selectRaw('SUM(amount) amount, SUM(paid) paid')->first();
        $page = $q->orderBy('due_date')->orderBy('id')->paginate(min((int) ($request->per_page ?: 25), 500));

        return response()->json($page->toArray() + ['totals' => [
            'amount'    => round((float) $totals->amount, 3),
            'paid'      => round((float) $totals->paid, 3),
            'remaining' => round((float) $totals->amount - (float) $totals->paid, 3),
        ]]);
    }

    public function payments(Request $request)
    {
        $q = Voucher::query()->where('source_type', 'contract')->where('type', 'receipt')
            ->with(['cashAccount:id,name,name_en', 'creator:id,name,name_en'])
            ->when(trim((string) $request->q), fn ($w, $t) => $w->where(fn ($x) => $x->where('number', 'like', "%{$t}%")->orWhere('party_name', 'like', "%{$t}%")->orWhere('description', 'like', "%{$t}%")))
            ->when($request->from, fn ($w, $v) => $w->whereDate('date', '>=', $v))
            ->when($request->to, fn ($w, $v) => $w->whereDate('date', '<=', $v))
            ->when($request->method, fn ($w, $v) => $w->where('method', $v));

        $sum = (clone $q)->sum('amount');
        $page = $q->orderByDesc('date')->orderByDesc('id')->paginate(min((int) ($request->per_page ?: 25), 500));
        $contracts = \App\Models\Contract::with(['student:id,name,name_en', 'guardian:id,name,name_en'])->whereIn('id', $page->getCollection()->pluck('source_id'))->get(['id', 'number', 'student_id', 'guardian_id'])->keyBy('id');
        $page->getCollection()->transform(function ($v) use ($contracts) {
            $c = $contracts[$v->source_id] ?? null;
            $v->contract_number = $c?->number;
            $v->student_name = $c?->student?->name;
            $v->student_name_en = $c?->student?->name_en;
            $v->party_name_en = $c?->guardian?->name_en;

            return $v;
        });

        return response()->json($page->toArray() + ['sum' => round((float) $sum, 3)]);
    }
}
