<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Grade;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class GradeController extends ResourceController
{
    protected string $model = Grade::class;

    protected array $search = ['name_ar', 'name_en'];

    protected array $withCount = ['sections', 'students'];

    protected array $sortable = ['id', 'sort', 'name_ar'];

    protected string $order = 'sort';

    protected string $dir = 'asc';

    protected bool $yearScoped = true;

    protected string $label = 'صف';

    protected array $showWith = ['sections'];

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'name_ar' => [$req, 'string', 'max:120'],
            'name_en' => ['nullable', 'string', 'max:120'],
            'sort'    => ['nullable', 'integer', 'min:0'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record && ! isset($data['sort'])) {
            $data['sort'] = (int) Grade::where('academic_year_id', $this->yearId($request))->max('sort') + 1;
        }

        return $data;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->students()->exists() ? 'لا يمكن حذف صف مسجّل فيه طلاب.' : null;
    }

    protected function beforeDelete(Model $record): void
    {
        $record->sections()->delete();
    }
}
