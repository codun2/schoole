<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ExamTerm;
use App\Models\GradeMark;
use App\Models\Section;
use App\Models\Student;
use App\Models\Subject;
use App\Support\Activity;
use App\Support\Grading;
use Illuminate\Http\Request;

/**
 * Academic grades: enter marks for one section × subject × term, then build
 * weighted report cards and ranked class results. The final per-subject
 * percentage weights each term by its `weight`; the overall percentage
 * averages the subject percentages.
 */
class MarkController extends Controller
{
    /** Marks sheet for a section + subject + term (all active students, prefilled). */
    public function sheet(Request $request)
    {
        $data = $request->validate([
            'section_id'   => ['required', 'integer', $this->owned('sections')],
            'subject_id'   => ['required', 'integer', $this->owned('subjects')],
            'exam_term_id' => ['required', 'integer', $this->owned('exam_terms')],
        ]);
        $section = Section::with('grade:id,name_ar')->findOrFail($data['section_id']);
        $subject = Subject::findOrFail($data['subject_id']);
        $term = ExamTerm::findOrFail($data['exam_term_id']);
        $marks = GradeMark::where('section_id', $section->id)->where('subject_id', $subject->id)->where('exam_term_id', $term->id)->get()->keyBy('student_id');

        $students = Student::where('section_id', $section->id)->where('status', 'active')->orderBy('name')->get(['id', 'name', 'name_en', 'student_no'])
            ->map(fn ($s) => [
                'id'         => $s->id,
                'name'       => $s->name,
                'name_en'    => $s->name_en,
                'student_no' => $s->student_no,
                'mark'       => isset($marks[$s->id]) ? (float) $marks[$s->id]->mark : null,
                'note'       => $marks[$s->id]->note ?? null,
            ]);

        return response()->json([
            'section'  => $section,
            'subject'  => $subject,
            'term'     => $term,
            'students' => $students,
            'saved'    => $marks->isNotEmpty(),
        ]);
    }

    public function save(Request $request)
    {
        $data = $request->validate([
            'section_id'         => ['required', 'integer', $this->owned('sections')],
            'subject_id'         => ['required', 'integer', $this->owned('subjects')],
            'exam_term_id'       => ['required', 'integer', $this->owned('exam_terms')],
            'marks'              => ['required', 'array'],
            'marks.*.student_id' => ['required', 'integer'],
            'marks.*.mark'       => ['nullable', 'numeric', 'min:0'],
            'marks.*.note'       => ['nullable', 'string', 'max:255'],
        ]);
        $section = Section::findOrFail($data['section_id']);
        $subject = Subject::findOrFail($data['subject_id']);
        $term = ExamTerm::findOrFail($data['exam_term_id']);
        if ($term->is_locked) {
            return response()->json(['message' => 'هذا الفصل مقفل ولا يمكن تعديل درجاته.'], 422);
        }
        $valid = Student::where('section_id', $section->id)->pluck('id')->flip();

        foreach ($data['marks'] as $m) {
            if (! isset($valid[$m['student_id']])) {
                continue;
            }
            $mark = $m['mark'] === null || $m['mark'] === '' ? null : min((float) $m['mark'], (float) $subject->max_mark);
            GradeMark::updateOrCreate(
                ['student_id' => $m['student_id'], 'subject_id' => $subject->id, 'exam_term_id' => $term->id],
                ['section_id' => $section->id, 'grade_id' => $section->grade_id, 'academic_year_id' => $section->academic_year_id, 'mark' => $mark, 'note' => $m['note'] ?? null]
            );
        }
        Activity::log('marks', $subject, "رصد درجات {$subject->name_ar} — {$term->name} — شعبة {$section->name}");

        return response()->json(['message' => 'تم حفظ الدرجات.']);
    }

    /** Full report card for one student: subjects × terms, weighted final, grade, rank. */
    public function reportCard(Request $request, $studentId)
    {
        $student = Student::with(['grade:id,name_ar', 'section:id,name', 'guardian:id,name'])->findOrFail($studentId);
        $yearId = $student->academic_year_id;
        $terms = ExamTerm::where('academic_year_id', $yearId)->orderBy('sort')->get();
        $subjects = Subject::where('academic_year_id', $yearId)
            ->where(fn ($q) => $q->whereNull('grade_ids')->orWhereJsonContains('grade_ids', (int) $student->grade_id))->orderBy('sort')->get();

        $marks = GradeMark::where('student_id', $student->id)->get()->keyBy(fn ($m) => $m->subject_id.'-'.$m->exam_term_id);
        $weightSum = max(0.0001, (float) $terms->sum('weight'));

        $rows = [];
        $overallSum = 0;
        $counted = 0;
        foreach ($subjects as $sub) {
            $termMarks = [];
            $weightedPct = 0;
            $gradedWeight = 0;
            foreach ($terms as $term) {
                $gm = $marks[$sub->id.'-'.$term->id] ?? null;
                $mark = $gm && $gm->mark !== null ? (float) $gm->mark : null;
                $termMarks[$term->id] = $mark;
                if ($mark !== null) {
                    $weightedPct += ($mark / (float) $sub->max_mark) * 100 * (float) $term->weight;
                    $gradedWeight += (float) $term->weight;
                }
            }
            $pct = $gradedWeight > 0 ? Grading::round($weightedPct / $gradedWeight) : null;
            $g = Grading::grade($pct);
            if ($pct !== null) {
                $overallSum += $pct;
                $counted++;
            }
            $rows[] = [
                'subject'    => $sub->only(['id', 'name_ar', 'name_en', 'max_mark']),
                'term_marks' => $termMarks,
                'final_mark' => $pct !== null ? Grading::round($pct / 100 * (float) $sub->max_mark) : null,
                'percent'    => $pct,
                'grade'      => $g,
            ];
        }
        $overall = $counted ? Grading::round($overallSum / $counted) : null;

        // final result: failed subjects (graded + below 50%) decide ناجح/راسب
        $failed = collect($rows)->filter(fn ($r) => $r['percent'] !== null && $r['percent'] < 50)->count();
        $result = $overall === null
            ? ['status' => '—', 'pass' => false, 'failed' => 0]
            : ['status' => $failed === 0 ? 'ناجح' : 'راسب', 'pass' => $failed === 0, 'failed' => $failed];

        return response()->json([
            'student' => $student,
            'year'    => \App\Models\AcademicYear::find($yearId)?->only(['id', 'name']),
            'terms'   => $terms,
            'rows'    => $rows,
            'overall' => ['percent' => $overall, 'grade' => Grading::grade($overall)],
            'rank'    => $overall !== null ? $this->rankOf($student, $overall) : null,
            'result'  => $result,
            'scale'   => collect(Grading::SCALE)->map(fn ($s) => ['min' => $s[0], 'letter' => $s[1], 'remark' => $s[2], 'color' => $s[3]])->values(),
            'issued_at' => now()->toDateString(),
        ]);
    }

    /** Ranked results for a whole section (overall percentage across all subjects/terms). */
    public function classResults(Request $request)
    {
        $data = $request->validate(['section_id' => ['required', 'integer', $this->owned('sections')]]);
        $section = Section::with('grade:id,name_ar')->findOrFail($data['section_id']);
        $terms = ExamTerm::where('academic_year_id', $section->academic_year_id)->get();
        $weightSum = max(0.0001, (float) $terms->sum('weight'));
        $subjects = Subject::where('academic_year_id', $section->academic_year_id)
            ->where(fn ($q) => $q->whereNull('grade_ids')->orWhereJsonContains('grade_ids', (int) $section->grade_id))->get()->keyBy('id');
        $students = Student::where('section_id', $section->id)->where('status', 'active')->get(['id', 'name', 'name_en', 'student_no']);
        $allMarks = GradeMark::where('section_id', $section->id)->get()->groupBy('student_id');

        $rows = $students->map(function ($st) use ($subjects, $terms, $weightSum, $allMarks) {
            $byKey = ($allMarks[$st->id] ?? collect())->keyBy(fn ($m) => $m->subject_id.'-'.$m->exam_term_id);
            $sum = 0;
            $counted = 0;
            $failed = 0;
            foreach ($subjects as $sub) {
                $pct = 0;
                $gw = 0;
                foreach ($terms as $term) {
                    $gm = $byKey[$sub->id.'-'.$term->id] ?? null;
                    if ($gm && $gm->mark !== null) {
                        $pct += ((float) $gm->mark / (float) $sub->max_mark) * 100 * (float) $term->weight;
                        $gw += (float) $term->weight;
                    }
                }
                if ($gw > 0) {
                    $subjectPct = $pct / $gw;
                    $sum += $subjectPct;
                    $counted++;
                    if ($subjectPct < 50) {
                        $failed++;
                    }
                }
            }
            $overall = $counted ? round($sum / $counted, 2) : null;

            return ['student_id' => $st->id, 'name' => $st->name, 'name_en' => $st->name_en, 'student_no' => $st->student_no, 'percent' => $overall, 'subjects_counted' => $counted, 'failed' => $failed, 'grade' => Grading::grade($overall)];
        })->sortByDesc(fn ($r) => $r['percent'] ?? -1)->values();

        $rank = 1;
        $rows = $rows->map(function ($r) use (&$rank) { $r['rank'] = $r['percent'] !== null ? $rank++ : null; return $r; });
        $graded = $rows->where('percent', '!==', null);

        return response()->json([
            'section'   => $section,
            'rows'      => $rows,
            'summary'   => [
                'count'   => $graded->count(),
                'average' => $graded->count() ? round($graded->avg('percent'), 2) : null,
                'highest' => $graded->max('percent'),
                'lowest'  => $graded->min('percent'),
                'passed'  => $graded->where('percent', '>=', 50)->count(),
                'failed'  => $graded->where('percent', '<', 50)->count(),
            ],
        ]);
    }

    private function rankOf(Student $student, float $overall): array
    {
        $section = Section::find($student->section_id);
        if (! $section) {
            return ['position' => null, 'of' => 0];
        }
        $terms = ExamTerm::where('academic_year_id', $section->academic_year_id)->get();
        $weightSum = max(0.0001, (float) $terms->sum('weight'));
        $subjects = Subject::where('academic_year_id', $section->academic_year_id)
            ->where(fn ($q) => $q->whereNull('grade_ids')->orWhereJsonContains('grade_ids', (int) $section->grade_id))->get();
        $peers = Student::where('section_id', $section->id)->where('status', 'active')->pluck('id');
        $allMarks = GradeMark::whereIn('student_id', $peers)->get()->groupBy('student_id');

        $better = 0;
        $of = 0;
        foreach ($peers as $pid) {
            $byKey = ($allMarks[$pid] ?? collect())->keyBy(fn ($m) => $m->subject_id.'-'.$m->exam_term_id);
            $sum = 0;
            $c = 0;
            foreach ($subjects as $sub) {
                $pct = 0;
                $gw = 0;
                foreach ($terms as $term) {
                    $gm = $byKey[$sub->id.'-'.$term->id] ?? null;
                    if ($gm && $gm->mark !== null) {
                        $pct += ((float) $gm->mark / (float) $sub->max_mark) * 100 * (float) $term->weight;
                        $gw += (float) $term->weight;
                    }
                }
                if ($gw > 0) {
                    $sum += $pct / $gw;
                    $c++;
                }
            }
            if ($c) {
                $of++;
                if (round($sum / $c, 2) > $overall + 0.001) {
                    $better++;
                }
            }
        }

        return ['position' => $better + 1, 'of' => $of];
    }
}
