<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\AcademicYear;
use App\Models\Grade;
use App\Models\Student;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AcademicYearController extends ResourceController
{
    protected string $model = AcademicYear::class;

    protected array $search = ['name'];

    protected string $label = 'سنة دراسية';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'       => [$record ? 'sometimes' : 'required', 'string', 'max:40'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_current' => ['boolean'],
        ];
    }

    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        if ($record->is_current || AcademicYear::count() === 1) {
            $this->makeCurrent($record);
        }
    }

    protected function transformAll($rows)
    {
        $grades = Grade::selectRaw('academic_year_id, COUNT(*) c')->groupBy('academic_year_id')->pluck('c', 'academic_year_id');
        $students = Student::selectRaw('academic_year_id, COUNT(*) c')->groupBy('academic_year_id')->pluck('c', 'academic_year_id');

        return $rows->map(function ($y) use ($grades, $students) {
            $y->grades_count = (int) ($grades[$y->id] ?? 0);
            $y->students_count = (int) ($students[$y->id] ?? 0);

            return $y;
        });
    }

    protected function cannotDelete(Model $record): ?string
    {
        if ($record->is_current) {
            return 'لا يمكن حذف السنة الدراسية الحالية.';
        }
        if (Grade::where('academic_year_id', $record->id)->exists() || Student::where('academic_year_id', $record->id)->exists()) {
            return 'لا يمكن حذف سنة دراسية تحتوي على صفوف أو طلاب.';
        }

        return null;
    }

    public function setCurrent(Request $request, $id)
    {
        $year = $this->find($id);
        $this->makeCurrent($year);

        return response()->json(['message' => 'تم تعيين '.$year->name.' سنةً دراسية حالية.']);
    }

    /**
     * Copy the grade/section/fee/bus structure of another year into this one
     * (handy when opening a new academic year).
     */
    public function cloneStructure(Request $request, $id)
    {
        $target = $this->find($id);
        $data = $request->validate(['from_year_id' => ['required', 'integer', $this->owned('academic_years')]]);
        $from = (int) $data['from_year_id'];
        if (Grade::where('academic_year_id', $target->id)->exists()) {
            return response()->json(['message' => 'السنة المستهدفة تحتوي على صفوف بالفعل.'], 422);
        }

        $map = [];
        foreach (Grade::where('academic_year_id', $from)->get() as $g) {
            $new = $g->replicate(['academic_year_id']);
            $new->academic_year_id = $target->id;
            $new->save();
            $map[$g->id] = $new->id;
            foreach ($g->sections as $s) {
                $ns = $s->replicate();
                $ns->academic_year_id = $target->id;
                $ns->grade_id = $new->id;
                $ns->save();
            }
        }
        foreach (\App\Models\FeeItem::where('academic_year_id', $from)->get() as $f) {
            $nf = $f->replicate();
            $nf->academic_year_id = $target->id;
            $nf->grade_id = $f->grade_id ? ($map[$f->grade_id] ?? null) : null;
            $nf->save();
        }
        foreach (\App\Models\Bus::where('academic_year_id', $from)->get() as $b) {
            $nb = $b->replicate();
            $nb->academic_year_id = $target->id;
            $nb->save();
        }

        return response()->json(['message' => 'تم نسخ الهيكل الدراسي ('.count($map).' صفوف) بنجاح.']);
    }

    private function makeCurrent(AcademicYear $year): void
    {
        AcademicYear::where('id', '!=', $year->id)->update(['is_current' => false]);
        if (! $year->is_current) {
            $year->is_current = true;
            $year->save();
        }
    }
}
