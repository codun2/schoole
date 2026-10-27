<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Section;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class SectionController extends ResourceController
{
    protected string $model = Section::class;

    protected array $search = ['name', 'room', 'grade.name_ar'];

    protected array $filters = ['grade_id'];

    protected array $with = ['grade:id,name_ar,name_en,sort', 'teacher:id,name,name_en'];

    protected array $withCount = ['students'];

    protected bool $yearScoped = true;

    protected string $order = 'grade_id';

    protected string $dir = 'asc';

    protected string $label = 'شعبة';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'grade_id'   => [$req, 'integer', $this->owned('grades')],
            'name'       => [$req, 'string', 'max:80'],
            'name_en'    => ['nullable', 'string', 'max:80'],
            'capacity'   => ['nullable', 'integer', 'min:0'],
            'room'       => ['nullable', 'string', 'max:80'],
            'room_en'    => ['nullable', 'string', 'max:80'],
            'teacher_id' => ['nullable', 'integer', $this->owned('employees')],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! empty($data['grade_id'])) {
            $data['academic_year_id'] = \App\Models\Grade::find($data['grade_id'])->academic_year_id;
        }

        return $data;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->students()->exists() ? 'لا يمكن حذف شعبة مسجّل فيها طلاب.' : null;
    }
}
