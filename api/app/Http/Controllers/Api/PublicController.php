<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\Application;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Grade;
use App\Models\Plan;
use App\Models\User;
use App\Support\SchoolSetup;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Unauthenticated endpoints: plans, school self-registration, online admission form. */
class PublicController extends Controller
{
    public function plans()
    {
        return response()->json(Plan::where('is_active', true)->orderBy('sort')->get());
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'school_name' => ['required', 'string', 'max:255'],
            'city'        => ['nullable', 'string', 'max:120'],
            'name'        => ['required', 'string', 'max:255'],
            'email'       => ['required', 'email', 'max:255'],
            'phone'       => ['required', 'string', 'max:40'],
            'password'    => ['required', 'string', 'min:6'],
            'plan_id'     => ['nullable', 'integer'],
        ]);

        if (User::withoutGlobalScopes()->where('email', $data['email'])->whereIn('role', ['admin', 'staff', 'super'])->exists()) {
            return response()->json(['message' => 'البريد الإلكتروني مستخدم مسبقاً.', 'errors' => ['email' => ['البريد الإلكتروني مستخدم مسبقاً.']]], 422);
        }

        $company = DB::transaction(function () use ($data) {
            $slug = Str::slug(Str::ascii($data['school_name'])) ?: 'school';
            $base = $slug;
            $i = 1;
            while (Company::where('slug', $slug)->exists()) {
                $slug = $base.'-'.(++$i);
            }

            $company = Company::create([
                'name'          => $data['school_name'],
                'slug'          => $slug,
                'city'          => $data['city'] ?? null,
                'phone'         => $data['phone'],
                'email'         => $data['email'],
                'status'        => 'active',
                'plan_id'       => $data['plan_id'] ?? Plan::orderBy('sort')->value('id'),
                'trial_ends_at' => now()->addDays(14),
                'principal_name' => $data['name'],
            ]);

            $admin = new User([
                'name'     => $data['name'],
                'email'    => $data['email'],
                'phone'    => $data['phone'],
                'role'     => 'admin',
                'title'    => 'مدير المدرسة',
                'status'   => 'active',
                'password' => $data['password'],
            ]);
            $admin->company_id = $company->id;
            $admin->save();

            SchoolSetup::defaults($company);

            return $company;
        });

        return response()->json(['message' => 'تم إنشاء حساب المدرسة بنجاح — تجربة مجانية ١٤ يوماً.', 'slug' => $company->slug], 201);
    }

    /** Public info for the online admission form. */
    public function school(string $slug)
    {
        $company = Company::where('slug', $slug)->where('status', 'active')->firstOrFail();
        $yearId = $company->currentYearId();

        return response()->json([
            'name'   => $company->name,
            'logo'   => $company->logo,
            'city'   => $company->city,
            'phone'  => $company->phone,
            'year'   => AcademicYear::withoutGlobalScopes()->find($yearId)?->name,
            'grades' => Grade::withoutGlobalScopes()->where('company_id', $company->id)->where('academic_year_id', $yearId)->orderBy('sort')->get(['id', 'name_ar', 'name_en']),
        ]);
    }

    public function apply(Request $request, string $slug)
    {
        $company = Company::where('slug', $slug)->where('status', 'active')->firstOrFail();
        $data = $request->validate([
            'student_name'         => ['required', 'string', 'max:255'],
            'gender'               => ['required', 'in:male,female'],
            'birth_date'           => ['nullable', 'date'],
            'nationality'          => ['nullable', 'string', 'max:80'],
            'national_id'          => ['nullable', 'string', 'max:40'],
            'grade_id'             => ['nullable', 'integer'],
            'previous_school'      => ['nullable', 'string', 'max:255'],
            'guardian_name'        => ['required', 'string', 'max:255'],
            'guardian_phone'       => ['required', 'string', 'max:40'],
            'guardian_national_id' => ['nullable', 'string', 'max:40'],
            'guardian_email'       => ['nullable', 'email'],
            'guardian_relation'    => ['nullable', 'string', 'max:40'],
            'notes'                => ['nullable', 'string', 'max:2000'],
        ]);

        $app = new Application($data);
        $app->company_id = $company->id;
        $app->academic_year_id = $company->currentYearId();
        $app->source = 'online';
        $app->status = 'new';
        $app->save();

        $n = new AppNotification(['type' => 'application', 'title' => 'طلب تسجيل جديد', 'body' => $data['student_name'].' — ولي الأمر: '.$data['guardian_name'], 'link' => '#/applications']);
        $n->company_id = $company->id;
        $n->save();

        return response()->json(['message' => 'تم استلام طلب التسجيل بنجاح، ستتواصل معك المدرسة قريباً.', 'id' => $app->id], 201);
    }
}
