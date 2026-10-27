<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * One login for every role. `login` is an email or a phone number; the
 * response tells the frontend where to go (super / app / parent).
 */
class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'login'    => ['required', 'string'],
            'password' => ['required', 'string'],
            'school'   => ['nullable', 'string'],
        ]);
        $login = trim($data['login']);

        $candidates = User::withoutGlobalScopes()
            ->where(fn ($q) => $q->where('email', $login)->orWhere('phone', $login))
            ->when($data['school'] ?? null, fn ($q, $slug) => $q->whereHas('company', fn ($c) => $c->where('slug', $slug)))
            ->get();

        $user = $candidates->first(fn ($u) => Hash::check($data['password'], $u->password));
        if (! $user) {
            throw ValidationException::withMessages(['login' => ['بيانات الدخول غير صحيحة.']]);
        }
        if ($user->status !== 'active') {
            throw ValidationException::withMessages(['login' => ['هذا الحساب موقوف، تواصل مع إدارة المدرسة.']]);
        }
        if (! $user->isSuper()) {
            $company = $user->company;
            if (! $company || ! $company->isActive()) {
                throw ValidationException::withMessages(['login' => [$company && $company->status === 'pending' ? 'حساب المدرسة بانتظار التفعيل من إدارة المنصة.' : 'اشتراك المدرسة غير مفعّل حالياً.']]);
            }
        }

        $token = $user->createToken($user->role)->plainTextToken;

        return response()->json(['token' => $token] + $this->payload($user));
    }

    public function me(Request $request)
    {
        return response()->json($this->payload($request->user()));
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'تم تسجيل الخروج.']);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'name'             => ['sometimes', 'string', 'max:255'],
            'phone'            => ['nullable', 'string', 'max:40'],
            'current_password' => ['required_with:password', 'string'],
            'password'         => ['nullable', 'string', 'min:6', 'confirmed'],
        ]);
        if (! empty($data['password'])) {
            if (! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => ['كلمة المرور الحالية غير صحيحة.']]);
            }
            $user->password = $data['password'];
        }
        $user->fill(collect($data)->only(['name', 'phone'])->all())->save();

        return response()->json($this->payload($user->fresh()));
    }

    /** Unread notifications + active announcements for the top bar. */
    public function badges(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'notifications' => AppNotification::whereNull('read_at')
                ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))->count(),
            'announcements' => Announcement::where('is_active', true)
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $user->company_id))
                ->whereIn('audience', ['staff', 'all'])->count(),
        ]);
    }

    private function payload(User $user): array
    {
        $company = $user->company;

        return [
            'home' => match ($user->role) {
                'super'    => '/super/',
                'guardian' => '/parent/',
                'teacher'  => '/teacher/',
                'student'  => '/student/',
                default    => '/app/',
            },
            'user' => [
                'id'          => $user->id,
                'name'        => $user->name,
                'email'       => $user->email,
                'phone'       => $user->phone,
                'role'        => $user->role,
                'title'       => $user->title,
                'photo'       => $user->photo,
                'permissions' => $user->role === 'admin' ? User::PERMISSIONS : ($user->permissions ?? []),
            ],
            'company' => $company ? [
                'id'          => $company->id,
                'name'        => $company->name,
                'name_en'     => $company->name_en,
                'slug'        => $company->slug,
                'logo'        => $company->logo,
                'currency'    => $company->currency,
                'tax_rate'    => $company->tax_rate,
                'theme'       => $company->theme,
                'modules'     => (object) ($company->settings['modules'] ?? []),
                'phone'        => $company->phone,
                'address'      => $company->address,
                'city'         => $company->city,
                'principal_name' => $company->principal_name,
                'license_number' => $company->license_number,
                'cr_number'    => $company->cr_number,
                'status'      => $company->status,
                'trial_ends_at' => $company->trial_ends_at,
                'current_year_id' => $company->currentYearId(),
            ] : null,
            // the school's own data names (subjects/grades) as Arabic→English pairs, merged into the
            // translation dictionary so these DB values render in English too (respecting custom name_en).
            'dict' => $company ? $this->nameDict($company) : (object) [],
        ];
    }

    /** Arabic→English pairs merged into the UI dictionary: subject/grade name_en, then the
     *  school's own custom translations (settings.translations) which take priority. */
    private function nameDict($company): object
    {
        $map = [];
        foreach (\App\Models\Subject::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name_ar', 'name_en']) as $s) {
            $map[$s->name_ar] = $s->name_en;
        }
        foreach (\App\Models\Grade::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name_ar', 'name_en']) as $g) {
            $map[$g->name_ar] = $g->name_en;
        }
        foreach (\App\Models\CustomField::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('label_en')->where('label_en', '!=', '')->get(['label', 'label_en']) as $f) {
            $map[$f->label] = $f->label_en;
        }
        foreach (\App\Models\Section::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\ExamTerm::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\FeeItem::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\Department::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\JobTitle::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\LeaveType::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\Branch::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\InventoryCategory::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\InventoryLocation::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\EvaluationCriterion::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach (\App\Models\EvaluationPeriod::withoutGlobalScopes()->where('company_id', $company->id)->whereNotNull('name_en')->where('name_en', '!=', '')->get(['name', 'name_en']) as $x) {
            $map[$x->name] = $x->name_en;
        }
        foreach ((array) ($company->settings['translations'] ?? []) as $ar => $en) {
            if (is_string($ar) && is_string($en) && trim($ar) !== '' && trim($en) !== '') {
                $map[trim($ar)] = trim($en);
            }
        }

        return (object) $map;
    }
}
