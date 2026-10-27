<?php

namespace App\Http\Controllers\Api\Portal;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Contract;
use App\Models\Guardian;
use App\Models\Installment;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Models\TimetableEntry;
use App\Http\Controllers\Api\School\MarkController;
use App\Models\Voucher;
use App\Support\StudentView;
use Illuminate\Http\Request;

/** Parent portal: a guardian sees only their own children; what it shows is controlled by the school admin. */
class PortalController extends Controller
{
    private function guardian(Request $request): Guardian
    {
        return Guardian::where('user_id', $request->user()->id)->firstOrFail();
    }

    /** Which sections the school lets parents see (all on by default). */
    private function view(Request $request): array
    {
        $pv = $request->user()->company->settings['parent_view'] ?? [];
        $on = fn ($k) => (bool) ($pv[$k] ?? true);

        return ['grades' => $on('grades'), 'attendance' => $on('attendance'), 'assignments' => $on('assignments'), 'timetable' => $on('timetable'), 'behavior' => $on('behavior'), 'finance' => $on('finance')];
    }

    public function home(Request $request)
    {
        $g = $this->guardian($request);
        $view = $this->view($request);
        $children = Student::with(['grade:id,name_ar,name_en', 'section:id,name,name_en', 'bus:id,number,driver_name,driver_phone'])
            ->where('guardian_id', $g->id)->whereIn('status', ['active', 'pending', 'suspended'])->orderBy('name')->get();
        $children->each(fn ($s) => $s->monitor = StudentView::badges($s)); // attendance %, absences, pending homework, upcoming exams

        $finance = null;
        if ($view['finance']) {
            $contracts = Contract::where('guardian_id', $g->id)->whereIn('status', ['active', 'completed']);
            $nextDue = Installment::whereIn('contract_id', (clone $contracts)->pluck('id'))->where('status', '!=', 'paid')->orderBy('due_date')->first();
            $finance = [
                'total'     => round((float) (clone $contracts)->sum('total'), 3),
                'paid'      => round((float) (clone $contracts)->sum('paid'), 3),
                'remaining' => round((float) (clone $contracts)->sum('remaining'), 3),
                'next_due'  => $nextDue,
            ];
        }

        return response()->json([
            'guardian'  => $g->only(['id', 'name', 'phone', 'email']),
            'school'    => $request->user()->company->only(['name', 'logo', 'phone', 'email', 'currency', 'address']),
            'view'      => $view,
            'children'  => $children,
            'finance'   => $finance,
            'announcements' => Announcement::where('is_active', true)->whereIn('audience', ['guardians', 'all'])
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $request->user()->company_id))->orderByDesc('id')->limit(10)->get(),
        ]);
    }

    public function child(Request $request, $id)
    {
        $g = $this->guardian($request);
        $view = $this->view($request);
        $s = Student::with(['grade:id,name_ar,name_en', 'section:id,name,name_en', 'bus:id,number,driver_name,driver_phone,route'])->where('guardian_id', $g->id)->findOrFail($id);

        $report = null;
        if ($view['grades']) {
            try {
                $report = app(MarkController::class)->reportCard($request, $s->id)->getData(true);
            } catch (\Throwable) {
            }
        }

        return response()->json([
            'student'     => $s,
            'view'        => $view,
            'monitor'     => StudentView::badges($s),
            'today'       => $view['timetable'] ? StudentView::todayLessons($s) : [],
            'assignments' => $view['assignments'] ? StudentView::assignments($s) : null,
            'attendance'  => $view['attendance'] ? StudentView::attendance($s) : null,
            'report'      => $view['grades'] ? $report : null,
            'timetable'   => $view['timetable'] ? StudentView::timetable($s, $request->user()->company->settings ?? []) : null,
            'notes'       => $view['behavior'] ? StudentView::notes($s) : null,
            'contracts'   => $view['finance'] ? Contract::with('installments')->where('student_id', $s->id)->whereIn('status', ['active', 'completed'])->orderByDesc('id')->get() : [],
        ]);
    }

    public function payments(Request $request)
    {
        $g = $this->guardian($request);
        if (! $this->view($request)['finance']) {
            return response()->json(['data' => []]); // the school hid finance from parents
        }
        $ids = Contract::where('guardian_id', $g->id)->pluck('id');
        $contracts = Contract::with('student:id,name,name_en')->whereIn('id', $ids)->get()->keyBy('id');

        return response()->json(['data' => Voucher::where('source_type', 'contract')->whereIn('source_id', $ids)->orderByDesc('date')->get()
            ->map(fn ($v) => $v->setAttribute('student_name', $contracts[$v->source_id]->student->name ?? null)->setAttribute('contract_number', $contracts[$v->source_id]->number ?? null))]);
    }
}
