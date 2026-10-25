<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Guardian;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class GuardianController extends ResourceController
{
    protected string $model = Guardian::class;

    protected array $search = ['name', 'national_id', 'phone', 'phone2', 'email'];

    protected array $filters = ['nationality'];

    protected array $withCount = ['students'];

    protected array $showWith = ['students.grade:id,name_ar', 'students.section:id,name', 'contracts'];

    protected string $label = 'ولي أمر';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'name'        => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'national_id' => ['nullable', 'string', 'max:40', function ($attr, $value, $fail) use ($record) {
                if ($value === null || trim((string) $value) === '') {
                    return;
                }
                $taken = Guardian::where('national_id', trim((string) $value))->when($record, fn ($q) => $q->where('id', '!=', $record->id))->exists();
                if ($taken) {
                    $fail('رقم الهوية مستخدم لولي أمر آخر في المدرسة.');
                }
            }],
            'nationality' => ['nullable', 'string', 'max:80'],
            'phone'       => ['nullable', 'string', 'max:40'],
            'phone2'      => ['nullable', 'string', 'max:40'],
            'email'       => ['nullable', 'email', 'max:255'],
            'relation'    => ['nullable', 'string', 'max:40'],
            'job'         => ['nullable', 'string', 'max:120'],
            'workplace'   => ['nullable', 'string', 'max:120'],
            'address'     => ['nullable', 'string', 'max:255'],
            'custom'      => ['nullable', 'array'],
            'notes'       => ['nullable', 'string'],
            'password'    => ['nullable', 'string', 'min:6'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        unset($data['password']);

        // A portal login needs a unique username (email or phone) within the school.
        if ($request->filled('password')) {
            $phone = $data['phone'] ?? $record?->phone;
            $email = ($data['email'] ?? $record?->email) ?: ($phone ? $phone.'@parent.local' : null);
            if (! $email && ! $phone) {
                throw \Illuminate\Validation\ValidationException::withMessages(['phone' => ['أدخل الجوال أو البريد ليتمكن ولي الأمر من الدخول.']]);
            }
            $taken = User::where(fn ($q) => $q->where('email', $email)->when($phone, fn ($w) => $w->orWhere('phone', $phone)))
                ->when($record?->user_id, fn ($q, $uid) => $q->where('id', '!=', $uid))
                ->exists();
            if ($taken) {
                throw \Illuminate\Validation\ValidationException::withMessages(['phone' => ['هذا الجوال/البريد مستخدم لحساب دخول آخر.']]);
            }
        }

        return $data;
    }

    /** Optional parent-portal login (role=guardian), using phone or email as the username. */
    protected function afterSave(Model $record, Request $request, bool $created): void
    {
        if (! $request->filled('password')) {
            return;
        }
        $login = $record->email ?: $record->phone;
        if (! $login) {
            return;
        }
        $attrs = ['name' => $record->name, 'phone' => $record->phone, 'email' => $record->email ?: $record->phone.'@parent.local', 'password' => $request->password];
        if ($record->user_id && ($u = User::find($record->user_id))) {
            $u->update($attrs);
        } else {
            $u = User::create($attrs + ['role' => 'guardian', 'status' => 'active']);
            $record->user_id = $u->id;
            $record->save();
        }
    }

    protected function transform(Model $record, bool $detail = false)
    {
        $record->has_login = $record->user_id !== null;

        return $record;
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->students()->exists() ? 'لا يمكن حذف ولي أمر مرتبط بطلاب.' : null;
    }

    protected function beforeDelete(Model $record): void
    {
        if ($record->user_id) {
            User::where('id', $record->user_id)->where('role', 'guardian')->delete();
        }
    }

    /** Bulk import from a parsed Excel/CSV sheet: rows = [{name, national_id, phone, ...}]. */
    public function import(Request $request)
    {
        $data = $request->validate(['rows' => ['required', 'array', 'max:2000']]);
        $created = 0;
        $skipped = [];
        foreach ($data['rows'] as $i => $row) {
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                $skipped[] = ['row' => $i + 2, 'reason' => 'الاسم فارغ'];
                continue;
            }
            $nid = trim((string) ($row['national_id'] ?? ''));
            if ($nid !== '' && Guardian::where('national_id', $nid)->exists()) {
                $skipped[] = ['row' => $i + 2, 'reason' => 'رقم الهوية مسجّل مسبقاً'];
                continue;
            }
            Guardian::create([
                'name'        => $name,
                'national_id' => $nid ?: null,
                'nationality' => $row['nationality'] ?? null,
                'phone'       => isset($row['phone']) ? (string) $row['phone'] : null,
                'email'       => $row['email'] ?? null,
                'relation'    => $row['relation'] ?? null,
                'job'         => $row['job'] ?? null,
                'address'     => $row['address'] ?? null,
            ]);
            $created++;
        }

        return response()->json(['created' => $created, 'skipped' => $skipped]);
    }
}
