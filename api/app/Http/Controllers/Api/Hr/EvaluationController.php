<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Models\Evaluation;
use App\Models\EvaluationCriterion;
use App\Models\EvaluationPeriod;
use App\Support\Activity;
use App\Support\Grading;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Staff performance evaluations. An evaluation scores an employee against the
 * shared criteria for one period; the total is a weighted percentage
 * (Σ score/max × weight ÷ Σ weight) and is mapped to a letter grade.
 */
class EvaluationController extends Controller
{
    public function index(Request $request)
    {
        $q = Evaluation::with(['employee:id,name,name_en,number', 'period:id,name', 'evaluator:id,name'])
            ->when($request->period_id, fn ($w, $v) => $w->where('period_id', $v))
            ->when($request->employee_id, fn ($w, $v) => $w->where('employee_id', $v))
            ->when(trim((string) $request->q), fn ($w, $t) => $w->whereHas('employee', fn ($e) => $e->where('name', 'like', "%{$t}%")));

        return response()->json($q->orderByDesc('id')->paginate(min((int) ($request->per_page ?: 25), 200)));
    }

    public function show(Request $request, $id)
    {
        $e = Evaluation::with(['employee:id,name,name_en,number', 'period', 'evaluator:id,name', 'scores'])->findOrFail($id);
        $e->criteria = EvaluationCriterion::orderBy('sort')->get();
        $e->grade_info = Grading::grade($e->total_score);

        return response()->json($e);
    }

    /** Blank scoring form data: the employee's criteria list + any existing scores. */
    public function form(Request $request)
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', $this->owned('employees')],
            'period_id'   => ['required', 'integer', $this->owned('evaluation_periods')],
        ]);
        $existing = Evaluation::with('scores')->where('employee_id', $data['employee_id'])->where('period_id', $data['period_id'])->first();
        $scores = $existing ? $existing->scores->keyBy('criterion_id') : collect();

        return response()->json([
            'criteria'   => EvaluationCriterion::orderBy('sort')->get(),
            'evaluation' => $existing,
            'scores'     => EvaluationCriterion::orderBy('sort')->get()->mapWithKeys(fn ($c) => [$c->id => [
                'score' => $scores[$c->id]->score ?? null,
                'note'  => $scores[$c->id]->note ?? null,
            ]]),
        ]);
    }

    public function store(Request $request)
    {
        return $this->upsert($request, null);
    }

    public function update(Request $request, $id)
    {
        return $this->upsert($request, Evaluation::findOrFail($id));
    }

    private function upsert(Request $request, ?Evaluation $eval)
    {
        $cid = $request->user()->company_id;
        $data = $request->validate([
            'employee_id'     => ['required', 'integer', $this->owned('employees'), Rule::unique('evaluations', 'employee_id')->where('period_id', $request->period_id)->where('company_id', $cid)->ignore($eval?->id)],
            'period_id'       => ['required', 'integer', $this->owned('evaluation_periods')],
            'date'            => ['nullable', 'date'],
            'notes'           => ['nullable', 'string'],
            'scores'          => ['required', 'array', 'min:1'],
            'scores.*.criterion_id' => ['required', 'integer', $this->owned('evaluation_criteria')],
            'scores.*.score'  => ['required', 'numeric', 'min:0'],
            'scores.*.note'   => ['nullable', 'string', 'max:255'],
        ], [], ['employee_id' => 'الموظف']);

        $period = EvaluationPeriod::find($data['period_id']);
        if ($period->status === 'closed') {
            return response()->json(['message' => 'فترة التقييم مغلقة.'], 422);
        }
        $criteria = EvaluationCriterion::whereIn('id', collect($data['scores'])->pluck('criterion_id'))->get()->keyBy('id');
        $weightSum = max(0.0001, (float) $criteria->sum('weight'));
        $weighted = 0;
        foreach ($data['scores'] as $s) {
            $c = $criteria[$s['criterion_id']] ?? null;
            if (! $c) {
                continue;
            }
            $score = min((float) $s['score'], (float) $c->max_score);
            $weighted += ($score / (float) $c->max_score) * 100 * ((float) $c->weight / $weightSum);
        }
        $total = Grading::round($weighted);
        $grade = Grading::grade($total);

        $eval = DB::transaction(function () use ($eval, $data, $request, $total, $grade) {
            $eval = $eval ?: new Evaluation;
            $eval->fill([
                'employee_id' => $data['employee_id'],
                'period_id'   => $data['period_id'],
                'total_score' => $total,
                'grade'       => $grade['letter'],
                'evaluator_id' => $request->user()->id,
                'date'        => $data['date'] ?? now()->toDateString(),
                'notes'       => $data['notes'] ?? null,
            ])->save();
            $eval->scores()->delete();
            foreach ($data['scores'] as $s) {
                $eval->scores()->create(['criterion_id' => $s['criterion_id'], 'score' => $s['score'], 'note' => $s['note'] ?? null]);
            }

            return $eval;
        });
        Activity::log($eval->wasRecentlyCreated ? 'create' : 'update', $eval, 'تقييم موظف: '.$eval->employee?->name);

        $eval->load('employee:id,name');
        $eval->grade_info = $grade;

        return response()->json($eval, 201);
    }

    public function destroy($id)
    {
        Evaluation::findOrFail($id)->delete();

        return response()->json(['message' => 'تم حذف التقييم.']);
    }
}
