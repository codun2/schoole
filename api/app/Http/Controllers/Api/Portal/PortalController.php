<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Contract;
use App\Models\Guardian;
use App\Models\Installment;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Http\Controllers\Api\School\MarkController;
use App\Models\Voucher;
use Illuminate\Http\Request;

/** Parent portal: a guardian sees only their own children and their family's finances. */
class PortalController extends Controller
{
    private function guardian(Request $request): Guardian
    {
        return Guardian::where('user_id', $request->user()->id)->firstOrFail();
    }

    public function home(Request $request)
    {
        $g = $this->guardian($request);
        $children = Student::with(['grade:id,name_ar', 'section:id,name', 'bus:id,number,driver_name,driver_phone'])
            ->where('guardian_id', $g->id)->whereIn('status', ['active', 'pending', 'suspended'])->orderBy('name')->get();
        $contracts = Contract::where('guardian_id', $g->id)->whereIn('status', ['active', 'completed']);
        $nextDue = Installment::whereIn('contract_id', (clone $contracts)->pluck('id'))->where('status', '!=', 'paid')->orderBy('due_date')->first();

        $children->each(function ($s) {
            $att = StudentAttendance::where('student_id', $s->id)->selectRaw("SUM(status IN ('present','late')) p, COUNT(*) t, SUM(status='absent') a")->first();
            $s->attendance_rate = $att->t ? round($att->p * 100 / $att->t, 1) : null;
            $s->absences = (int) $att->a;
        });

        return response()->json([
            'guardian'  => $g->only(['id', 'name', 'phone', 'email']),
            'school'    => $request->user()->company->only(['name', 'logo', 'phone', 'email', 'currency', 'address']),
            'children'  => $children,
            'finance'   => [
                'total'     => round((float) (clone $contracts)->sum('total'), 3),
                'paid'      => round((float) (clone $contracts)->sum('paid'), 3),
                'remaining' => round((float) (clone $contracts)->sum('remaining'), 3),
                'next_due'  => $nextDue,
            ],
            'announcements' => Announcement::where('is_active', true)->whereIn('audience', ['guardians', 'all'])
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $request->user()->company_id))->orderByDesc('id')->limit(10)->get(),
        ]);
    }

    public function child(Request $request, $id)
    {
        $g = $this->guardian($request);
        $s = Student::with(['grade:id,name_ar', 'section:id,name', 'bus:id,number,driver_name,driver_phone,route'])->where('guardian_id', $g->id)->findOrFail($id);

        $report = null;
        try {
            $report = app(MarkController::class)->reportCard($request, $s->id)->getData(true);
        } catch (\Throwable) {
        }

        return response()->json([
            'student'    => $s,
            'attendance' => StudentAttendance::where('student_id', $s->id)->orderByDesc('date')->limit(60)->get(['date', 'status', 'note']),
            'contracts'  => Contract::with('installments')->where('student_id', $s->id)->whereIn('status', ['active', 'completed'])->orderByDesc('id')->get(),
            'report'     => $report,
        ]);
    }

    public function payments(Request $request)
    {
        $g = $this->guardian($request);
        $ids = Contract::where('guardian_id', $g->id)->pluck('id');
        $contracts = Contract::with('student:id,name')->whereIn('id', $ids)->get()->keyBy('id');

        return response()->json(['data' => Voucher::where('source_type', 'contract')->whereIn('source_id', $ids)->orderByDesc('date')->get()
            ->map(fn ($v) => $v->setAttribute('student_name', $contracts[$v->source_id]->student->name ?? null)->setAttribute('contract_number', $contracts[$v->source_id]->number ?? null))]);
    }
}
