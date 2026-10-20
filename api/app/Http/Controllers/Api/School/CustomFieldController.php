<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\CustomField;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomFieldController extends ResourceController
{
    protected string $model = CustomField::class;

    protected array $search = ['label'];

    protected array $filters = ['entity'];

    protected string $order = 'sort';

    protected string $dir = 'asc';

    protected array $sortable = ['id', 'sort'];

    protected string $label = 'حقل مخصّص';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'entity'   => [$req, 'in:student,guardian'],
            'label'    => [$req, 'string', 'max:120'],
            'type'     => ['nullable', 'in:text,number,date,select'],
            'options'  => ['nullable', 'array'],
            'required' => ['boolean'],
            'sort'     => ['nullable', 'integer'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $data['key'] = 'f_'.Str::lower(Str::random(6));
        }
        if (isset($data['options'])) {
            $data['options'] = array_values(array_filter(array_map('trim', $data['options'])));
        }

        return $data;
    }
}
