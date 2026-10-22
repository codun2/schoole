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
                'status'      => $company->status,
                'trial_ends_at' => $company->trial_ends_at,
                'current_year_id' => $company->currentYearId(),
            ] : null,
        ];
    }
}
