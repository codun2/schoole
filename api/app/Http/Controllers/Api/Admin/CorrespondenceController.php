<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\Correspondence;
use App\Support\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Incoming / outgoing / internal correspondence register. */
class CorrespondenceController extends ResourceController
{
    use HandlesUploads;

    protected string $model = Correspondence::class;

    protected array $search = ['number', 'subject', 'party', 'body'];

    protected array $filters = ['direction', 'status', 'priority', 'category_id', 'assigned_to'];

    protected array $with = ['category:id,name', 'assignee:id,name'];

    protected ?string $dateColumn = 'date';

    protected string $label = 'مراسلة';

    protected function rules(Request $request, ?Model $record): array
    {
        $req = $record ? 'sometimes' : 'required';

        return [
            'direction'   => [$req, 'in:incoming,outgoing,internal'],
            'date'        => [$req, 'date'],
            'subject'     => [$req, 'string', 'max:255'],
            'party'       => ['nullable', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', $this->owned('correspondence_categories')],
            'priority'    => ['nullable', 'in:normal,important,urgent'],
            'status'      => ['nullable', 'in:new,in_progress,closed'],
            'body'        => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer', $this->owned('users')],
            'file'        => ['nullable', 'file', 'max:10240'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $prefix = ['incoming' => 'IN-', 'outgoing' => 'OUT-', 'internal' => 'INT-'][$data['direction']];
            $data['number'] = Numbering::next(Correspondence::class, $prefix.date('Y').'-', 4);
        }
        if ($request->hasFile('file')) {
            $data['attachment'] = $this->storeImage($request->file('file'), 'correspondence');
        }
        unset($data['file']);

        return $data;
    }
}
