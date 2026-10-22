<?php

namespace App\Http\Controllers\Api\Super;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Company;
use App\Models\Contract;
use App\Models\Employee;
use App\Models\Plan;
use App\Models\Student;
use App\Models\User;
use App\Support\SchoolSetup;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Platform owner: schools (tenants), subscription plans, platform announcements. */
class PlatformController extends Controller
{
    public function dashboard()
    {
        $students = Student::withoutGlobalScopes()->where('status', 'active')->selectRaw('company_id, COUNT(*) c')->groupBy('company_id')->pluck('c', 'company_id');
        $plans = Plan::pluck('price_monthly', 'id');
        $mrr = Company::where('status', 'active')->whereNotNull('plan_id')->get()->sum(fn ($c) => (float) ($plans[$c->plan_id] ?? 0));

        $growth = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = now()->startOfMonth()->subMonthsNoOverflow($i);
            $growth[] = ['month' => $m->format('Y-m'), 'schools' => Company::where('created_at', '<', $m->copy()->endOfMonth())->count()];
        }

        return response()->json([
            'schools'         => Company::count(),
            'schools_active'  => Company::where('status', 'active')->count(),
            'schools_pending' => Company::where('status', 'pending')->count(),
            'schools_trial'   => Company::where('status', 'active')->where('trial_ends_at', '>', now())->count(),
            'students'        => (int) $students->sum(),
            'employees'       => Employee::withoutGlobalScopes()->where('status', 'active')->count(),
            'users'           => User::withoutGlobalScopes()->whereIn('role', ['admin', 'staff'])->count(),
            'guardians'       => User::withoutGlobalScopes()->where('role', 'guardian')->count(),
            'mrr'             => round($mrr, 3),
            'tuition_volume'  => round((float) Contract::withoutGlobalScopes()->whereIn('status', ['active', 'completed'])->sum('total'), 3),
            'growth'          => $growth,
            'by_plan'         => Company::leftJoin('plans', 'plans.id', '=', 'companies.plan_id')->selectRaw("COALESCE(plans.name, 'بدون باقة') name, COUNT(*) c")->groupBy('plans.name')->get(),
            'latest'          => Company::with('plan:id,name')->orderByDesc('id')->limit(6)->get(),
        ]);
    }

    public function schools(Request $request)
    {
        $students = Student::withoutGlobalScopes()->selectRaw('company_id, COUNT(*) c')->groupBy('company_id')->pluck('c', 'company_id');
        $users = User::withoutGlobalScopes()->whereIn('role', ['admin', 'staff'])->selectRaw('company_id, COUNT(*) c')->groupBy('company_id')->pluck('c', 'company_id');

        $page = Company::with('plan:id,name')
            ->when(trim((string) $request->q), fn ($q, $t) => $q->where(fn ($w) => $w->where('name', 'like', "%{$t}%")->orWhere('email', 'like', "%{$t}%")->orWhere('phone', 'like', "%{$t}%")->orWhere('slug', 'like', "%{$t}%")))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->plan_id, fn ($q, $v) => $q->where('plan_id', $v))
            ->orderByDesc('id')->paginate(25);
        $page->getCollection()->transform(function ($c) use ($students, $users) {
            $c->students_count = (int) ($students[$c->id] ?? 0);
            $c->users_count = (int) ($users[$c->id] ?? 0);
            $c->admin = User::withoutGlobalScopes()->where('company_id', $c->id)->where('role', 'admin')->orderBy('id')->first(['id', 'name', 'email', 'phone']);

            return $c;
        });

        return response()->json($page);
    }

    public function storeSchool(Request $request)
    {
        $data = $request->validate($this->schoolRules(null) + [
            'admin_name'     => ['required', 'string', 'max:255'],
            'admin_email'    => ['required', 'email'],
            'admin_password' => ['required', 'string', 'min:6'],
        ]);
        $company = DB::transaction(function () use ($data) {
            $slug = $data['slug'] ?? (Str::slug(Str::ascii($data['name'])) ?: 'school-'.Str::lower(Str::random(4)));
            while (Company::where('slug', $slug)->exists()) {
                $slug .= '-'.rand(2, 99);
            }
            $company = Company::create(collect($data)->except(['admin_name', 'admin_email', 'admin_password'])->all() + ['slug' => $slug, 'status' => $data['status'] ?? 'active']);
            $admin = new User(['name' => $data['admin_name'], 'email' => $data['admin_email'], 'role' => 'admin', 'title' => 'مدير المدرسة', 'status' => 'active', 'password' => $data['admin_password']]);
            $admin->company_id = $company->id;
            $admin->save();
            SchoolSetup::defaults($company);

            return $company;
        });

        return response()->json($company, 201);
    }

    public function updateSchool(Request $request, $id)
    {
        $c = Company::findOrFail($id);
        $c->update($request->validate($this->schoolRules($c)));

        return response()->json($c->fresh('plan'));
    }

    public function setStatus(Request $request, $id)
    {
        $c = Company::findOrFail($id);
        $status = $request->validate(['status' => ['required', 'in:active,suspended,pending']])['status'];
        $c->update(['status' => $status]);
        if ($status !== 'active') {
            // Kick everybody of that school out.
            DB::table('personal_access_tokens')->where('tokenable_type', User::class)
                ->whereIn('tokenable_id', User::withoutGlobalScopes()->where('company_id', $c->id)->pluck('id'))->delete();
        }

        return response()->json(['message' => ['active' => 'تم تفعيل المدرسة.', 'suspended' => 'تم إيقاف المدرسة.', 'pending' => 'تم تعليق المدرسة.'][$status]]);
    }

    /** Sign in as the school's admin (support). Returns a short-lived token. */
    public function impersonate($id)
    {
        $c = Company::findOrFail($id);
        $admin = User::withoutGlobalScopes()->where('company_id', $c->id)->where('role', 'admin')->orderBy('id')->firstOrFail();
        $token = $admin->createToken('impersonate', ['*'], now()->addHours(2))->plainTextToken;

        return response()->json(['token' => $token, 'home' => '/app/']);
    }

    public function destroySchool($id)
    {
        $c = Company::findOrFail($id);
        if (Student::withoutGlobalScopes()->where('company_id', $c->id)->exists()) {
            return response()->json(['message' => 'لا يمكن حذف مدرسة لديها طلاب — قم بإيقافها بدلاً من ذلك.'], 422);
        }
        DB::transaction(function () use ($c) {
            foreach (DB::select('SHOW TABLES') as $row) {
                $tbl = array_values((array) $row)[0];
                if ($tbl !== 'companies' && \Illuminate\Support\Facades\Schema::hasColumn($tbl, 'company_id')) {
                    DB::table($tbl)->where('company_id', $c->id)->delete();
                }
            }
            $c->delete();
        });

        return response()->json(['message' => 'تم حذف المدرسة وكل بياناتها.']);
    }

    private function schoolRules(?Company $c): array
    {
        return [
            'name'                 => [$c ? 'sometimes' : 'required', 'string', 'max:255'],
            'name_en'              => ['nullable', 'string', 'max:255'],
            'slug'                 => ['nullable', 'alpha_dash', 'max:60', Rule::unique('companies', 'slug')->ignore($c?->id)],
            'status'               => ['nullable', 'in:active,suspended,pending'],
            'plan_id'              => ['nullable', 'integer', 'exists:plans,id'],
            'trial_ends_at'        => ['nullable', 'date'],
            'subscription_ends_at' => ['nullable', 'date'],
            'phone'                => ['nullable', 'string', 'max:40'],
            'email'                => ['nullable', 'email'],
            'city'                 => ['nullable', 'string', 'max:120'],
            'currency'             => ['nullable', 'string', 'max:8'],
        ];
    }

    // ------------------------------------------------------------- plans

    public function plans()
    {
        $counts = Company::selectRaw('plan_id, COUNT(*) c')->groupBy('plan_id')->pluck('c', 'plan_id');

        return response()->json(['data' => Plan::orderBy('sort')->get()->map(fn ($p) => $p->setAttribute('schools_count', (int) ($counts[$p->id] ?? 0)))]);
    }

    public function storePlan(Request $request)
    {
        return response()->json(Plan::create($request->validate($this->planRules(true))), 201);
    }

    public function updatePlan(Request $request, $id)
    {
        $p = Plan::findOrFail($id);
        $p->update($request->validate($this->planRules(false)));

        return response()->json($p);
    }

    public function destroyPlan($id)
    {
        if (Company::where('plan_id', $id)->exists()) {
            return response()->json(['message' => 'الباقة مستخدمة من مدارس.'], 422);
        }
        Plan::findOrFail($id)->delete();

        return response()->json(['message' => 'تم الحذف.']);
    }

    private function planRules(bool $create): array
    {
        return [
            'name'          => [$create ? 'required' : 'sometimes', 'string', 'max:120'],
            'description'   => ['nullable', 'string', 'max:255'],
            'price_monthly' => ['nullable', 'numeric', 'min:0'],
            'price_yearly'  => ['nullable', 'numeric', 'min:0'],
            'max_students'  => ['nullable', 'integer', 'min:0'],
            'max_users'     => ['nullable', 'integer', 'min:0'],
            'features'      => ['nullable', 'array'],
            'is_active'     => ['boolean'],
            'sort'          => ['nullable', 'integer'],
        ];
    }

    // ------------------------------------------------------ announcements

    public function announcements()
    {
        return response()->json(['data' => Announcement::whereNull('company_id')->orderByDesc('id')->get()]);
    }

    public function storeAnnouncement(Request $request)
    {
        $data = $request->validate(['title' => ['required', 'string', 'max:255'], 'body' => ['nullable', 'string'], 'audience' => ['required', 'in:staff,guardians,all'], 'is_active' => ['boolean']]);

        return response()->json(Announcement::create($data + ['company_id' => null]), 201);
    }

    public function destroyAnnouncement($id)
    {
        Announcement::whereNull('company_id')->findOrFail($id)->delete();

        return response()->json(['message' => 'تم الحذف.']);
    }
}
