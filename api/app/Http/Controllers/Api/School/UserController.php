<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** School staff accounts (admin/staff) and their section permissions. */
class UserController extends ResourceController
{
    protected string $model = User::class;

    protected array $search = ['name', 'email', 'phone', 'title'];

    protected array $filters = ['role', 'status'];

    protected string $dir = 'asc';

    protected string $label = 'مستخدم';

    protected function baseQuery(Request $request): Builder
    {
        return User::query()->whereIn('role', ['admin', 'staff']);
    }

    protected function find($id): Model
    {
        return User::query()->whereIn('role', ['admin', 'staff'])->findOrFail($id);
    }

    protected function rules(Request $request, ?Model $record): array
    {
        $cid = $request->user()->company_id;

        return [
            'name'          => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'email'         => [$record ? 'sometimes' : 'required', 'email', Rule::unique('users', 'email')->where('company_id', $cid)->ignore($record?->id)],
            'phone'         => ['nullable', 'string', 'max:40'],
            'title'         => ['nullable', 'string', 'max:120'],
            'role'          => ['nullable', 'in:admin,staff'],
            'status'        => ['nullable', 'in:active,suspended'],
            'permissions'   => ['nullable', 'array'],
            'permissions.*' => ['in:'.implode(',', User::PERMISSIONS)],
            'password'      => [$record ? 'nullable' : 'required', 'string', 'min:6'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if (empty($data['password'])) {
            unset($data['password']);
        }
        if ($record && $record->id === $request->user()->id) {
            unset($data['role'], $data['status']); // can't demote / lock yourself out
        }

        return $data;
    }

    protected function cannotDelete(Model $record): ?string
    {
        if ($record->id === auth()->id()) {
            return 'لا يمكنك حذف حسابك.';
        }
        if ($record->role === 'admin' && User::where('role', 'admin')->count() <= 1) {
            return 'يجب أن يبقى مدير واحد على الأقل.';
        }

        return null;
    }
}
