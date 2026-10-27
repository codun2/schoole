<?php

namespace App\Support;

use App\Http\Controllers\Api\School\TimetableController;
use App\Models\Announcement;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Models\TimetableEntry;

/**
 * "What a student sees" — one builder used by the student portal (self) and the
 * parent portal (per child), so both stay identical.
 */
class StudentView
{
    public static function timetable(Student $s, array $settings): array
    {
        $entries = $s->section_id
            ? TimetableEntry::with(['subject:id,name_ar', 'teacher:id,name'])->where('section_id', $s->section_id)->orderBy('day')->orderBy('period')->get()
                ->map(fn ($e) => ['day' => $e->day, 'period' => $e->period, 'subject' => $e->subject?->name_ar, 'teacher' => $e->teacher?->name, 'room' => $e->room])->values()
            : collect();

        return [
            'days'      => $settings['school_days'] ?? [0, 1, 2, 3, 4],
            'periods'   => (int) ($settings['periods'] ?? 7),
            'day_names' => TimetableController::DAYS,
            'entries'   => $entries,
            'today'     => (int) now()->dayOfWeek,
        ];
    }

    /** Section assignments (not archived) with this student's own submission state. */
    public static function assignments(Student $s)
    {
        if (! $s->section_id) {
            return collect();
        }
        $list = Assignment::with(['subject:id,name_ar', 'teacher:id,name'])->where('section_id', $s->section_id)
            ->where('status', '!=', 'archived')->orderByDesc('due_date')->orderByDesc('id')->get();
        $subs = AssignmentSubmission::where('student_id', $s->id)->whereIn('assignment_id', $list->pluck('id'))->get()->keyBy('assignment_id');
        $today = now()->toDateString();

        return $list->map(function ($a) use ($subs, $today) {
            $sub = $subs[$a->id] ?? null;
            $due = $a->due_date?->format('Y-m-d');

            return [
                'id' => $a->id, 'type' => $a->type, 'title' => $a->title, 'description' => $a->description,
                'subject' => $a->subject?->name_ar, 'teacher' => $a->teacher?->name,
                'due_date' => $due, 'due_time' => $a->due_time, 'duration_minutes' => $a->duration_minutes,
                'max_mark' => (float) $a->max_mark, 'attachment' => $a->attachment, 'status' => $a->status,
                'submitted' => (bool) ($sub->submitted ?? false),
                'mark' => $sub && $sub->mark !== null ? (float) $sub->mark : null,
                'note' => $sub->note ?? null,
                'overdue' => $due && $due < $today && ! ($sub->submitted ?? false) && $a->type === 'homework',
            ];
        })->values();
    }

    public static function attendance(Student $s, ?string $from = null, ?string $to = null): array
    {
        $q = StudentAttendance::where('student_id', $s->id)
            ->when($from, fn ($w) => $w->where('date', '>=', $from))
            ->when($to, fn ($w) => $w->where('date', '<=', $to));
        $t = (clone $q)->selectRaw("SUM(status='present') p, SUM(status='absent') a, SUM(status='late') l, SUM(status='excused') e, COUNT(*) n")->first();

        return [
            'rows'   => (clone $q)->orderByDesc('date')->limit(120)->get(['date', 'status', 'note']),
            'totals' => ['present' => (int) $t->p, 'absent' => (int) $t->a, 'late' => (int) $t->l, 'excused' => (int) $t->e, 'total' => (int) $t->n,
                'rate' => $t->n ? round(($t->p + $t->l) * 100 / $t->n, 1) : null],
        ];
    }

    public static function todayLessons(Student $s)
    {
        if (! $s->section_id) {
            return collect();
        }

        return TimetableEntry::with(['subject:id,name_ar', 'teacher:id,name'])->where('section_id', $s->section_id)
            ->where('day', (int) now()->dayOfWeek)->orderBy('period')->get()
            ->map(fn ($e) => ['period' => $e->period, 'subject' => $e->subject?->name_ar, 'teacher' => $e->teacher?->name, 'room' => $e->room])->values();
    }

    public static function home(Student $s, $company): array
    {
        $assignments = self::assignments($s);
        $today = now()->toDateString();
        $pending = $assignments->filter(fn ($a) => $a['status'] === 'open' && ! $a['submitted'] && $a['mark'] === null)->values();
        $upcoming = $assignments->filter(fn ($a) => in_array($a['type'], ['quiz', 'exam'], true) && $a['status'] === 'open' && $a['due_date'] && $a['due_date'] >= $today)
            ->sortBy('due_date')->take(5)->values();
        $att = self::attendance($s)['totals'];

        return [
            'student'       => $s,
            'school'        => $company->only(['name', 'logo', 'phone', 'email', 'currency']),
            'today'         => self::todayLessons($s),
            'pending'       => $pending->take(8),
            'upcoming'      => $upcoming,
            'stats'         => ['lessons_today' => self::todayLessons($s)->count(), 'pending' => $pending->count(), 'upcoming' => $upcoming->count(), 'attendance_rate' => $att['rate'], 'absences' => $att['absent']],
            'announcements' => Announcement::where('is_active', true)->whereIn('audience', ['students', 'all'])
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $company->id))->orderByDesc('id')->limit(8)->get(),
        ];
    }
}
