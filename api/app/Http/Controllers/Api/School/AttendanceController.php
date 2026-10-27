<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\Section;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Support\Activity;
use Illuminate\Http\Request;

/** Daily student attendance: a sheet per section/date, bulk save, and a period report. */
class AttendanceController extends Controller
{
    public function sheet(Request $request)
    {
        $data = $request->validate([
            'section_id' => ['required', 'integer', $this->owned('sections')],
            'date'       => ['required', 'date'],
        ]);
        $section = Section::with('grade:id,name_ar')->find($data['section_id']);
        $marks = StudentAttendance::where('section_id', $section->id)->whereDate('date', $data['date'])->get()->keyBy('student_id');

        $students = Student::where('section_id', $section->id)->where('status', 'active')->orderBy('name')->get(['id', 'name', 'name_en', 'student_no', 'gender'])
            ->map(fn ($s) => [
                'id'         => $s->id,
                'name'       => $s->name,
                'name_en'    => $s->name_en,
                'student_no' => $s->student_no,
                'gender'     => $s->gender,
                'status'     => $marks[$s->id]->status ?? null,
                'note'       => $marks[$s->id]->note ?? null,
            ]);

        return response()->json(['section' => $section, 'date' => $data['date'], 'students' => $students, 'saved' => $marks->isNotEmpty()]);
    }

    public function save(Request $request)
    {
        $data = $request->validate([
            'section_id'         => ['required', 'integer', $this->owned('sections')],
            'date'               => ['required', 'date', 'before_or_equal:'.now()->addDay()->toDateString() /* tolerate clients a timezone ahead of the server */],
            'marks'              => ['required', 'array'],
            'marks.*.student_id' => ['required', 'integer'],
            'marks.*.status'     => ['required', 'in:present,absent,late,excused'],
            'marks.*.note'       => ['nullable', 'string', 'max:255'],
        ]);
        $section = Section::find($data['section_id']);
        $valid = Student::where('section_id', $section->id)->pluck('id')->flip();
        $absent = 0;

        foreach ($data['marks'] as $m) {
            if (! isset($valid[$m['student_id']])) {
                continue;
            }
            StudentAttendance::updateOrCreate(
                ['student_id' => $m['student_id'], 'date' => $data['date']],
                ['section_id' => $section->id, 'academic_year_id' => $section->academic_year_id, 'status' => $m['status'], 'note' => $m['note'] ?? null]
            );
            $absent += $m['status'] === 'absent' ? 1 : 0;
        }
        Activity::log('attendance', $section, 'تسجيل حضور شعبة '.$section->name.' ليوم '.$data['date']);
        if ($absent > 0) {
            Activity::notify('attendance', 'غياب طلاب', "{$absent} طالب غائب في شعبة {$section->name} بتاريخ {$data['date']}", '#/attendance');
        }

        return response()->json(['message' => 'تم حفظ الحضور.']);
    }

    /** Per-student totals over a period (optionally one section), plus a daily trend. */
    public function report(Request $request)
    {
        $data = $request->validate([
            'from'       => ['required', 'date'],
            'to'         => ['required', 'date', 'after_or_equal:from'],
            'section_id' => ['nullable', 'integer'],
            'grade_id'   => ['nullable', 'integer'],
        ]);
        $q = StudentAttendance::whereBetween('date', [$data['from'], $data['to']])
            ->when($data['section_id'] ?? null, fn ($w, $v) => $w->where('section_id', $v))
            ->when($data['grade_id'] ?? null, fn ($w, $v) => $w->whereHas('student', fn ($s) => $s->where('grade_id', $v)));

        $rows = (clone $q)->selectRaw("student_id,
                SUM(status='present') present, SUM(status='absent') absent,
                SUM(status='late') late, SUM(status='excused') excused, COUNT(*) total")
            ->groupBy('student_id')->get();
        $names = Student::with(['grade:id,name_ar', 'section:id,name'])->whereIn('id', $rows->pluck('student_id'))->get()->keyBy('id');

        $daily = (clone $q)->selectRaw("date, SUM(status='present' OR status='late') present, COUNT(*) total")
            ->groupBy('date')->orderBy('date')->get()
            ->map(fn ($d) => ['date' => substr((string) $d->date, 0, 10), 'rate' => $d->total ? round($d->present * 100 / $d->total, 1) : 0]);

        return response()->json([
            'students' => $rows->map(fn ($r) => [
                'student_id' => $r->student_id,
                'name'       => $names[$r->student_id]->name ?? '—',
                'class'      => trim(($names[$r->student_id]->grade->name_ar ?? '').' / '.($names[$r->student_id]->section->name ?? ''), ' /'),
                'present'    => (int) $r->present,
                'absent'     => (int) $r->absent,
                'late'       => (int) $r->late,
                'excused'    => (int) $r->excused,
                'rate'       => $r->total ? round(($r->present + $r->late) * 100 / $r->total, 1) : 0,
            ])->sortByDesc('absent')->values(),
            'daily' => $daily,
        ]);
    }
}
