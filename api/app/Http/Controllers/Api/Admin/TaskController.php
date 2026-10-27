<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\Task;
use App\Support\Activity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Tasks & appointments with priority, progress, assignee and a calendar feed. */
class TaskController extends ResourceController
{
    use HandlesUploads;

    protected string $model = Task::class;

    protected array $search = ['title', 'description'];

    protected array $filters = ['status', 'priority', 'assigned_to', 'branch_id'];

    protected array $with = ['branch:id,name', 'assignee:id,name'];

    protected array $sortable = ['id', 'start_date', 'end_date', 'progress'];

    protected string $label = 'مهمة';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'title'       => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'title_en'    => ['nullable', 'string', 'max:255'],
            'description_en' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'branch_id'   => ['nullable', 'integer', $this->owned('branches')],
            'priority'    => ['nullable', 'in:normal,important,urgent'],
            'status'      => ['nullable', 'in:new,in_progress,done,cancelled'],
            'progress'    => ['nullable', 'integer', 'min:0', 'max:100'],
            'start_date'  => ['nullable', 'date'],
            'end_date'    => ['nullable', 'date', 'after_or_equal:start_date'],
            'assigned_to' => ['nullable', 'integer', $this->owned('users')],
            'file'        => ['nullable', 'file', 'max:10240'],
        ];
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        if ($request->boolean('mine')) {
            $query->where('assigned_to', $request->user()->id);
        }
        if ($request->boolean('overdue')) {
            $query->whereNotIn('status', ['done', 'cancelled'])->whereDate('end_date', '<', now()->toDateString());
        }
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (! $record) {
            $data['created_by'] = $request->user()->id;
        }
        if (($data['status'] ?? null) === 'done') {
            $data['progress'] = 100;
        } elseif (isset($data['progress']) && (int) $data['progress'] === 100 && ! isset($data['status'])) {
            $data['status'] = 'done';
        } elseif (isset($data['progress']) && (int) $data['progress'] > 0 && ($data['status'] ?? $record?->status ?? 'new') === 'new') {
            $data['status'] = 'in_progress';
        }
        if ($request->hasFile('file')) {
            $data['attachment'] = $this->storeImage($request->file('file'), 'tasks');
        }
        unset($data['file']);

        return $data;
    }

    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        if ($record->assigned_to && ($created || $record->wasChanged('assigned_to')) && $record->assigned_to !== $request->user()->id) {
            Activity::notify('task', 'مهمة جديدة مسندة إليك', $record->title, '#/tasks', $record->assigned_to);
        }
    }

    /** Calendar feed: tasks overlapping [from, to]. */
    public function calendar(Request $request)
    {
        $data = $request->validate(['from' => ['required', 'date'], 'to' => ['required', 'date']]);

        return response()->json(Task::with('assignee:id,name')
            ->where(fn ($q) => $q->whereBetween('start_date', [$data['from'], $data['to']])
                ->orWhereBetween('end_date', [$data['from'], $data['to']])
                ->orWhere(fn ($w) => $w->where('start_date', '<', $data['from'])->where('end_date', '>', $data['to'])))
            ->orderBy('start_date')->get());
    }
}
