<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\License;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Licences & permits with expiry tracking (valid / expiring ≤30d / expired). */
class LicenseController extends ResourceController
{
    use HandlesUploads;

    protected string $model = License::class;

    protected array $search = ['name', 'number', 'issuer'];

    protected array $sortable = ['id', 'expiry_date', 'name'];

    protected string $order = 'expiry_date';

    protected string $dir = 'asc';

    protected string $label = 'ترخيص';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'        => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'name_en'     => ['nullable', 'string', 'max:255'],
            'number'      => ['nullable', 'string', 'max:80'],
            'issuer'      => ['nullable', 'string', 'max:255'],
            'issuer_en'   => ['nullable', 'string', 'max:255'],
            'issue_date'  => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'cost'        => ['nullable', 'numeric', 'min:0'],
            'notes'       => ['nullable', 'string'],
            'file'        => ['nullable', 'file', 'max:10240'],
        ];
    }

    protected function extraFilters(Builder $query, Request $request): void
    {
        $today = now()->toDateString();
        match ($request->state) {
            'expired'  => $query->whereDate('expiry_date', '<', $today),
            'expiring' => $query->whereBetween('expiry_date', [$today, now()->addDays(30)->toDateString()]),
            'valid'    => $query->where(fn ($w) => $w->whereNull('expiry_date')->orWhereDate('expiry_date', '>', now()->addDays(30)->toDateString())),
            default    => null,
        };
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if ($request->hasFile('file')) {
            $data['attachment'] = $this->storeImage($request->file('file'), 'licenses');
        }
        unset($data['file']);

        return $data;
    }
}
