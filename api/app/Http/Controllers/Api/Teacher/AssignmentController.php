<?php

namespace App\Http\Controllers\Api\Teacher;

use App\Http\Controllers\Concerns\HandlesUploads;
use App\Http\Controllers\Controller;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\Employee;
use App\Models\Section;
use App\Models\Student;
use App\Models\TimetableEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Homework / quizzes / exams owned by the logged-in teacher. Scope: only sections the teacher
 * is homeroom of or teaches in (same rule as the rest of the portal). Grading creates one
 * submission row per student (submitted flag + mark + note).
 */
class AssignmentController extends Controller
{
    use HandlesUploads;

    private const WITH = ['section:id,name,grade_id', 'section.grade:id,name_ar', 'subject:id,name_ar,max_mark'];

    private function emp(Request $request): Employee
    {
        return Employee::where('user_id', $request->user()->id)->firstOrFail();
    }

    private function mySectionIds(Employee $e)
    {
        return Section::where('teacher_id', $e->id)->pluck('id')
            ->merge(TimetableEntry::where('teacher_id', $e->id)->distinct()->pluck('section_id'))->unique()->values();
    }

    private function mine(Request $request, $id): Assignment
    {
        return Assignment::with(self::WITH)->where('teacher_id', $this->emp($request)->id)->findOrFail($id);
    }

    /** Attach grading progress to a list of assignments (one query per list, not per row). */
    private function withProgress($items)
    {
        if ($items->isEmpty()) {
            return $items;
        }
        $totals = Student::whereIn('section_id', $items->pluck('section_id')->unique())->where('status', 'active')
            ->selectRaw('section_id, COUNT(*) c')->groupBy('section_id')->pluck('c', 'section_id');
        // aliases must not collide with cast attributes (a `submitted` alias would be cast to boolean)
        $subs = AssignmentSubmission::whereIn('assignment_id', $items->pluck('id'))
            ->selectRaw('assignment_id, SUM(submitted) submitted_n, SUM(mark IS NOT NULL) graded_n')->groupBy('assignment_id')->get()->keyBy('assignment_id');

        return $items->map(function ($a) use ($totals, $subs) {
            $total = (int) ($totals[$a->section_id] ?? 0);
            $graded = (int) ($subs[$a->id]->graded_n ?? 0);
            $a->students_total = $total;
            $a->submitted_count = (int) ($subs[$a->id]->submitted_n ?? 0);
            $a->graded_count = $graded;
            $a->pending_count = max(0, $total - $graded); // still to grade

            return $a;
        });
    }

    public function index(Request $request)
    {
        $e = $this->emp($request);
        $q = Assignment::with(self::WITH)->where('teacher_id', $e->id)
            ->when($request->filled('section_id'), fn ($w) => $w->where('section_id', $request->section_id))
            ->when($request->filled('type'), fn ($w) => $w->where('type', $request->type))
            ->when($request->filled('status'), fn ($w) => $w->where('status', $request->status), fn ($w) => $w->where('status', '!=', 'archived'))
            ->orderByDesc('due_date')->orderByDesc('id');

        return response()->json(['data' => $this->withProgress($q->get())]);
    }

    private function rules(bool $create): array
    {
        $req = $create ? 'required' : 'sometimes';

        return [
            'section_id'       => [$req, 'integer'],
            'subject_id'       => ['nullable', 'integer', $this->owned('subjects')],
            'type'             => [$req, 'in:'.implode(',', Assignment::TYPES)],
            'title'            => [$req, 'string', 'max:255'],
            'description'      => ['nullable', 'string', 'max:5000'],
            'due_date'         => [$req, 'date'],
            'due_time'         => ['nullable', 'date_format:H:i'],
            'duration_minutes' => ['nullable', 'integer', 'min:1', 'max:600'],
            'max_mark'         => ['nullable', 'numeric', 'min:0.5', 'max:1000'],
            'status'           => ['nullable', 'in:'.implode(',', Assignment::STATUSES)],
            'attachment'       => ['nullable', 'file', 'max:10240'],
            'remove_attachment' => ['nullable', 'boolean'],
        ];
    }

    public function store(Request $request)
    {
        $e = $this->emp($request);
        $data = $request->validate($this->rules(true));
        abort_unless($this->mySectionIds($e)->contains((int) $data['section_id']), 403, 'لا تملك صلاحية على هذه الشعبة.');
        unset($data['attachment'], $data['remove_attachment']);
        if ($request->hasFile('attachment')) {
            $data['attachment'] = $this->storeImage($request->file('attachment'), 'assignments');
        }
        $section = Section::findOrFail($data['section_id']);
        $a = new Assignment($data + ['max_mark' => $data['max_mark'] ?? 10, 'status' => $data['status'] ?? 'open']);
        $a->teacher_id = $e->id;
        $a->academic_year_id = $section->academic_year_id;
        $a->save();

        return response()->json($this->withProgress(collect([$a->load(self::WITH)]))->first(), 201);
    }

    public function update(Request $request, $id)
    {
        $a = $this->mine($request, $id);
        $data = $request->validate($this->rules(false));
        if (isset($data['section_id']) && (int) $data['section_id'] !== (int) $a->section_id) {
            abort_unless($this->mySectionIds($this->emp($request))->contains((int) $data['section_id']), 403, 'لا تملك صلاحية على هذه الشعبة.');
        }
        unset($data['attachment']);
        if ($request->hasFile('attachment')) {
            $this->deleteImage($a->attachment);
            $data['attachment'] = $this->storeImage($request->file('attachment'), 'assignments');
        } elseif ($request->boolean('remove_attachment')) {
            $this->deleteImage($a->attachment);
            $data['attachment'] = null;
        }
        unset($data['remove_attachment']);
        $a->fill($data)->save();

        return response()->json($this->withProgress(collect([$a->fresh(self::WITH)]))->first());
    }

    public function destroy(Request $request, $id)
    {
        $a = $this->mine($request, $id);
        DB::transaction(function () use ($a) {
            $a->submissions()->delete();
            $this->deleteImage($a->attachment);
            $a->delete();
        });

        return response()->json(['message' => 'تم الحذف.']);
    }

    /** Students of the assignment's section with their submission row (if any). */
    public function grading(Request $request, $id)
    {
        $a = $this->mine($request, $id);
        $subs = $a->submissions()->get()->keyBy('student_id');
        $students = Student::where('section_id', $a->section_id)->where('status', 'active')->orderBy('name')->get(['id', 'name', 'student_no'])
            ->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->name, 'student_no' => $s->student_no,
                'submitted' => (bool) ($subs[$s->id]->submitted ?? false),
                'mark' => isset($subs[$s->id]) && $subs[$s->id]->mark !== null ? (float) $subs[$s->id]->mark : null,
                'note' => $subs[$s->id]->note ?? null,
            ]);

        return response()->json(['assignment' => $this->withProgress(collect([$a]))->first(), 'students' => $students]);
    }

    public function gradingSave(Request $request, $id)
    {
        $a = $this->mine($request, $id);
        $data = $request->validate([
            'rows'             => ['required', 'array'],
            'rows.*.student_id' => ['required', 'integer'],
            'rows.*.submitted' => ['nullable', 'boolean'],
            'rows.*.mark'      => ['nullable', 'numeric', 'min:0'],
            'rows.*.note'      => ['nullable', 'string', 'max:255'],
        ]);
        $allowed = Student::where('section_id', $a->section_id)->pluck('id')->flip();
        $max = (float) $a->max_mark;
        DB::transaction(function () use ($data, $a, $allowed, $max) {
            foreach ($data['rows'] as $r) {
                if (! isset($allowed[$r['student_id']])) {
                    continue;
                }
                if (isset($r['mark']) && $r['mark'] !== null && (float) $r['mark'] > $max) {
                    throw ValidationException::withMessages(['rows' => ["الدرجة أكبر من الحد الأقصى ({$max})."]]);
                }
                AssignmentSubmission::updateOrCreate(
                    ['assignment_id' => $a->id, 'student_id' => $r['student_id']],
                    ['submitted' => (bool) ($r['submitted'] ?? false) || (isset($r['mark']) && $r['mark'] !== null), 'mark' => $r['mark'] ?? null, 'note' => $r['note'] ?? null]
                );
            }
        });

        return response()->json(['message' => 'تم حفظ التصحيح.', 'assignment' => $this->withProgress(collect([$a->fresh(self::WITH)]))->first()]);
    }
}
