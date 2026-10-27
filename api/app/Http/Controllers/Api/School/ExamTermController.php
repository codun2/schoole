<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\ExamTerm;
use App\Models\GradeMark;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class ExamTermController extends ResourceController
{
    protected string $model = ExamTerm::class;

    protected array $search = ['name'];

    protected array $sortable = ['id', 'sort'];

    protected string $order = 'sort';

    protected string $dir = 'asc';

    protected bool $yearScoped = true;

    protected string $label = 'فصل دراسي';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'      => [$record ? 'sometimes' : 'required', 'string', 'max:120'],
            'name_en'   => ['nullable', 'string', 'max:120'],
            'weight'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'sort'      => ['nullable', 'integer', 'min:0'],
            'is_locked' => ['boolean'],
        ];
    }

    protected function cannotDelete(Model $record): ?string
    {
        return GradeMark::where('exam_term_id', $record->id)->exists() ? 'لا يمكن حذف فصل مرصودة فيه درجات.' : null;
    }
}
