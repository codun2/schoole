<?php

namespace App\Http\Controllers\Api\Teacher;

use App\Http\Controllers\Api\School\AttendanceController;
use App\Http\Controllers\Api\School\MarkController;
use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\Employee;
use App\Models\ExamTerm;
use App\Models\Guardian;
use App\Models\Section;
use App\Models\Student;
use App\Models\StudentAttendance;
use App\Models\Subject;
use App\Models\TimetableEntry;
use App\Support\Activity;
use App\Support\Numbering;
use Illuminate\Http\Request;

/**
 * Teacher portal. A teacher is an Employee (is_teacher) with a linked login
 * (role=teacher, employees.user_id). Access is scoped row-by-row to:
 *   - homeroom sections (sections.teacher_id = me): manage students + attendance + all subjects' marks.
 *   - teaching assignments (timetable_entries.teacher_id = me): enter marks for that subject × section only.
 * Nothing financial or HR is ever exposed here.
 */
class TeacherController extends Controller
{
    private function emp(Request $request): Employee
    {
        return Employee::where('user_id', $request->user()->id)->firstOrFail();
    }

    /** Section ids where I am the homeroom teacher. */
    private function homeroomIds(Employee $e)
    {
        return Section::where('teacher_id', $e->id)->pluck('id');
    }

    /** Section ids where I teach at least one subject (from the timetable). */
    private function teachingSectionIds(Employee $e)
    {
        return TimetableEntry::where('teacher_id', $e->id)->distinct()->pluck('section_id');
    }

    /** Every section I may view (homeroom ∪ teaching). */
    private function mySectionIds(Employee $e)
    {
        return $this->homeroomIds($e)->merge($this->teachingSectionIds($e))->unique()->values();
    }

    private function assertHomeroom(Employee $e, int $sectionId): void
    {
        abort_unless($this->homeroomIds($e)->contains($sectionId), 403, 'هذه الشعبة ليست من فصولك.');
    }

    private function assertMySection(Employee $e, int $sectionId): void
    {
        abort_unless($this->mySectionIds($e)->contains($sectionId), 403, 'لا تملك صلاحية على هذه الشعبة.');
    }

    /** Marks allowed if the section is my homeroom, or I teach that subject there. */
    private function assertGradeable(Employee $e, int $sectionId, int $subjectId): void
    {
        if ($this->homeroomIds($e)->contains($sectionId)) {
            return;
        }
        $ok = TimetableEntry::where('teacher_id', $e->id)->where('section_id', $sectionId)->where('subject_id', $subjectId)->exists();
        abort_unless($ok, 403, 'لا تُدرّس هذه المادة لهذه الشعبة.');
    }

    // ---------------------------------------------------------------- screens

    public function home(Request $request)
    {
        $e = $this->emp($request);
        $homeroom = Section::with('grade:id,name_ar')->where('teacher_id', $e->id)
            ->withCount(['students as students_count' => fn ($q) => $q->where('status', 'active')])->get();
        $teaching = Section::with('grade:id,name_ar')->whereIn('id', $this->teachingSectionIds($e))->get(['id', 'name', 'grade_id']);
        $subjectIds = TimetableEntry::where('teacher_id', $e->id)->distinct()->pluck('subject_id');
        $subjects = Subject::whereIn('id', $subjectIds)->orderBy('sort')->get(['id', 'name_ar']);

        $studentIds = Student::whereIn('section_id', $this->homeroomIds($e))->where('status', 'active')->pluck('id');
        $todayTaken = StudentAttendance::whereIn('section_id', $this->homeroomIds($e))->whereDate('date', now()->toDateString())->distinct()->count('section_id');

        $today = $this->myLessons($e, (int) now()->dayOfWeek); // 0=Sun..6=Sat

        // open assignments whose date has passed and that still have ungraded students
        $open = Assignment::with(['section:id,name,grade_id', 'section.grade:id,name_ar', 'subject:id,name_ar'])
            ->where('teacher_id', $e->id)->where('status', 'open')->get();
        $totals = Student::whereIn('section_id', $open->pluck('section_id')->unique())->where('status', 'active')
            ->selectRaw('section_id, COUNT(*) c')->groupBy('section_id')->pluck('c', 'section_id');
        $graded = AssignmentSubmission::whereIn('assignment_id', $open->pluck('id'))->whereNotNull('mark')
            ->selectRaw('assignment_id, COUNT(*) c')->groupBy('assignment_id')->pluck('c', 'assignment_id');
        $todayStr = now()->toDateString();
        $brief = fn ($a) => ['id' => $a->id, 'title' => $a->title, 'type' => $a->type, 'due_date' => $a->due_date?->format('Y-m-d'), 'due_time' => $a->due_time,
            'section' => trim(($a->section?->grade?->name_ar ?? '').' — '.($a->section?->name ?? ''), ' —'), 'subject' => $a->subject?->name_ar,
            'pending' => max(0, (int) ($totals[$a->section_id] ?? 0) - (int) ($graded[$a->id] ?? 0))];
        $toGrade = $open->filter(fn ($a) => $a->due_date && $a->due_date->format('Y-m-d') <= $todayStr && ((int) ($totals[$a->section_id] ?? 0) - (int) ($graded[$a->id] ?? 0)) > 0)
            ->sortBy('due_date')->values()->map($brief);
        $upcoming = $open->filter(fn ($a) => in_array($a->type, ['quiz', 'exam'], true) && $a->due_date && $a->due_date->format('Y-m-d') >= $todayStr && $a->due_date->diffInDays(now()) <= 14)
            ->sortBy('due_date')->values()->map($brief);

        return response()->json([
            'to_grade' => $toGrade,
            'upcoming' => $upcoming,
            'teacher'  => $e->only(['id', 'name', 'number']),
            'school'   => $request->user()->company->only(['name', 'logo', 'phone', 'email', 'currency']),
            'homeroom' => $homeroom,
            'teaching' => $teaching,
            'subjects' => $subjects,
            'today'    => $today,
            'stats'    => [
                'homeroom_sections' => $homeroom->count(),
                'teaching_sections' => $this->teachingSectionIds($e)->count(),
                'students'          => $studentIds->count(),
                'attendance_today'  => $todayTaken,
                'lessons_today'     => $today->count(),
                'to_grade'          => $toGrade->count(),
                'upcoming'          => $upcoming->count(),
            ],
            'announcements' => Announcement::where('is_active', true)->whereIn('audience', ['staff', 'all'])
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $request->user()->company_id))
                ->orderByDesc('id')->limit(8)->get(),
        ]);
    }

    /** This teacher's timetable entries for one weekday (0=Sun..6=Sat), ordered by period. */
    private function myLessons(Employee $e, int $day)
    {
        return TimetableEntry::with(['subject:id,name_ar', 'section:id,name,grade_id', 'section.grade:id,name_ar'])
            ->where('teacher_id', $e->id)->where('day', $day)->orderBy('period')->get()
            ->map(fn ($x) => [
                'period'  => $x->period,
                'subject' => $x->subject?->name_ar,
                'section' => $x->section?->name,
                'grade'   => $x->section?->grade?->name_ar,
                'room'    => $x->room,
            ])->values();
    }

    /** The teacher's full weekly timetable + the school's days/periods config. */
    public function timetable(Request $request)
    {
        $e = $this->emp($request);
        $s = $request->user()->company->settings ?? [];
        $entries = TimetableEntry::with(['subject:id,name_ar', 'section:id,name,grade_id', 'section.grade:id,name_ar'])
            ->where('teacher_id', $e->id)->orderBy('day')->orderBy('period')->get()
            ->map(fn ($x) => [
                'day'     => $x->day,
                'period'  => $x->period,
                'section' => $x->section?->name,
                'grade'   => $x->section?->grade?->name_ar,
                'subject' => $x->subject?->name_ar,
                'room'    => $x->room,
            ])->values();

        return response()->json([
            'days'      => $s['school_days'] ?? [0, 1, 2, 3, 4],
            'periods'   => (int) ($s['periods'] ?? 7),
            'day_names' => \App\Http\Controllers\Api\School\TimetableController::DAYS,
            'entries'   => $entries,
            'today'     => (int) now()->dayOfWeek,
        ]);
    }

    /** All my sections for selectors, each flagged homeroom/teaching. */
    public function sections(Request $request)
    {
        $e = $this->emp($request);
        $home = $this->homeroomIds($e);
        $sections = Section::with('grade:id,name_ar')->whereIn('id', $this->mySectionIds($e))->orderBy('grade_id')->get()
            ->map(fn ($s) => [
                'id'       => $s->id,
                'name'     => $s->name,
                'grade'    => $s->grade?->name_ar,
                'homeroom' => $home->contains($s->id),
            ]);

        return response()->json(['sections' => $sections]);
    }

    /** Subjects + terms available for a given section's mark sheet. */
    public function gradeOptions(Request $request)
    {
        $e = $this->emp($request);
        $sid = (int) $request->query('section_id');
        $this->assertMySection($e, $sid);
        $section = Section::findOrFail($sid);

        if ($this->homeroomIds($e)->contains($sid)) {
            $subjects = Subject::where('academic_year_id', $section->academic_year_id)
                ->where(fn ($q) => $q->whereNull('grade_id')->orWhere('grade_id', $section->grade_id))
                ->orderBy('sort')->get(['id', 'name_ar', 'max_mark']);
        } else {
            $subjectIds = TimetableEntry::where('teacher_id', $e->id)->where('section_id', $sid)->distinct()->pluck('subject_id');
            $subjects = Subject::whereIn('id', $subjectIds)->orderBy('sort')->get(['id', 'name_ar', 'max_mark']);
        }
        $terms = ExamTerm::where('academic_year_id', $section->academic_year_id)->orderBy('sort')->get();

        return response()->json(['subjects' => $subjects, 'terms' => $terms]);
    }

    // ---------------------------------------------------------------- students (homeroom)

    public function students(Request $request)
    {
        $e = $this->emp($request);
        $sid = (int) $request->query('section_id');
        $this->assertHomeroom($e, $sid);

        $students = Student::with('guardian:id,name,phone')->where('section_id', $sid)->orderBy('name')
            ->get(['id', 'name', 'name_en', 'student_no', 'national_id', 'gender', 'status', 'guardian_id']);

        return response()->json(['data' => $students]);
    }

    public function storeStudent(Request $request)
    {
        $e = $this->emp($request);
        $data = $request->validate([
            'section_id'     => ['required', 'integer'],
            'name'           => ['required', 'string', 'max:255'],
            'name_en'        => ['nullable', 'string', 'max:255'],
            'gender'         => ['nullable', 'in:male,female'],
            'national_id'    => ['nullable', 'string', 'max:40', function ($attr, $value, $fail) use ($request) {
                $yearId = $request->user()->company?->currentYearId();
                if ($value !== null && trim((string) $value) !== '' && \App\Models\Student::where('national_id', trim((string) $value))->where('academic_year_id', $yearId)->exists()) {
                    $fail('رقم الهوية مستخدم لطالب آخر في نفس السنة الدراسية.');
                }
            }],
            'birth_date'     => ['nullable', 'date'],
            'guardian_name'  => ['nullable', 'string', 'max:255'],
            'guardian_phone' => ['nullable', 'string', 'max:40'],
        ]);
        $this->assertHomeroom($e, (int) $data['section_id']);
        $section = Section::findOrFail($data['section_id']);

        $guardianId = null;
        if (! empty($data['guardian_name'])) {
            $guardianId = Guardian::create(['name' => $data['guardian_name'], 'phone' => $data['guardian_phone'] ?? null])->id;
        }

        $student = Student::create([
            'academic_year_id' => $section->academic_year_id,
            'grade_id'         => $section->grade_id,
            'section_id'       => $section->id,
            'name'             => $data['name'],
            'name_en'          => $data['name_en'] ?? null,
            'gender'           => $data['gender'] ?? 'male',
            'national_id'      => $data['national_id'] ?? null,
            'birth_date'       => $data['birth_date'] ?? null,
            'guardian_id'      => $guardianId,
            'student_no'       => Numbering::next(Student::class, 'ST-', 5, 'student_no'),
            'status'           => 'active',
            'registered_at'    => now()->toDateString(),
        ]);
        Activity::log('create', $student, 'طالب (أضافه المعلم): '.$student->name);

        return response()->json($student->load('guardian:id,name,phone'), 201);
    }

    public function updateStudent(Request $request, $id)
    {
        $e = $this->emp($request);
        $student = Student::findOrFail($id);
        $this->assertHomeroom($e, (int) $student->section_id);

        $data = $request->validate([
            'name'        => ['sometimes', 'string', 'max:255'],
            'name_en'     => ['nullable', 'string', 'max:255'],
            'gender'      => ['nullable', 'in:male,female'],
            'national_id' => ['nullable', 'string', 'max:40', function ($attr, $value, $fail) use ($student) {
                if ($value !== null && trim((string) $value) !== '' && \App\Models\Student::where('national_id', trim((string) $value))->where('academic_year_id', $student->academic_year_id)->where('id', '!=', $student->id)->exists()) {
                    $fail('رقم الهوية مستخدم لطالب آخر في نفس السنة الدراسية.');
                }
            }],
            'birth_date'  => ['nullable', 'date'],
            'status'      => ['nullable', 'in:active,suspended'],
        ]);
        $student->fill($data)->save();
        Activity::log('update', $student, 'طالب (عدّله المعلم): '.$student->name);

        return response()->json($student->load('guardian:id,name,phone'));
    }

    // ---------------------------------------------------------------- marks (delegated, pre-authorized)

    public function marksSheet(Request $request)
    {
        $e = $this->emp($request);
        $this->assertGradeable($e, (int) $request->query('section_id'), (int) $request->query('subject_id'));

        return app(MarkController::class)->sheet($request);
    }

    public function marksSave(Request $request)
    {
        $e = $this->emp($request);
        $this->assertGradeable($e, (int) $request->input('section_id'), (int) $request->input('subject_id'));

        return app(MarkController::class)->save($request);
    }

    public function reportCard(Request $request, $studentId)
    {
        $e = $this->emp($request);
        $student = Student::findOrFail($studentId);
        $this->assertMySection($e, (int) $student->section_id);

        return app(MarkController::class)->reportCard($request, $student->id);
    }

    public function classResults(Request $request)
    {
        $e = $this->emp($request);
        $this->assertMySection($e, (int) $request->query('section_id'));

        return app(MarkController::class)->classResults($request);
    }

    // ---------------------------------------------------------------- attendance (homeroom only)

    public function attendanceSheet(Request $request)
    {
        $e = $this->emp($request);
        $this->assertHomeroom($e, (int) $request->query('section_id'));

        return app(AttendanceController::class)->sheet($request);
    }

    /** Attendance totals per student for a date range — homeroom sections only. */
    public function attendanceReport(Request $request)
    {
        $e = $this->emp($request);
        $this->assertHomeroom($e, (int) $request->query('section_id'));

        return app(AttendanceController::class)->report($request);
    }

    public function attendanceSave(Request $request)
    {
        $e = $this->emp($request);
        $this->assertHomeroom($e, (int) $request->input('section_id'));

        return app(AttendanceController::class)->save($request);
    }
}
