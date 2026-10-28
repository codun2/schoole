<?php

namespace Tests\Feature\Concerns;

use App\Models\AcademicYear;
use App\Models\Company;
use App\Models\Grade;
use App\Models\Section;
use App\Models\User;
use App\Support\SchoolSetup;

/**
 * Builds a complete tenant the way the real app does (company → SchoolSetup defaults → admin user)
 * and logs in through the HTTP API so every test exercises the same auth/tenant middleware as production.
 */
trait CreatesTenant
{
    protected int $seq = 0;

    /** @return array{company: Company, admin: User, token: string, year: AcademicYear, grade: Grade, section: Section} */
    protected function makeTenant(string $slug = 'school-a'): array
    {
        $this->seq++;
        $company = Company::create(['name' => 'مدرسة '.$slug, 'name_en' => 'School '.$slug, 'slug' => $slug, 'status' => 'active', 'currency' => 'SAR']);

        $admin = new User(['name' => 'مدير '.$slug, 'name_en' => 'Admin '.$slug, 'email' => "admin@{$slug}.test", 'role' => 'admin', 'status' => 'active', 'password' => 'secret123']);
        $admin->company_id = $company->id;
        $admin->save();

        SchoolSetup::defaults($company); // binds/clears the tenant context itself
        // re-bind so the year lookup and the creates below are scoped to THIS company (BelongsToCompany auto-fills company_id)
        app()->instance('currentCompanyId', $company->id);
        $year = AcademicYear::where('is_current', true)->first();
        $grade = Grade::create(['name_ar' => 'الصف الأول', 'name_en' => 'Grade 1', 'academic_year_id' => $year->id, 'sort' => 1]);
        $section = Section::create(['grade_id' => $grade->id, 'name' => 'شعبة أ', 'name_en' => 'Section A', 'academic_year_id' => $year->id, 'capacity' => 30]);
        app()->forgetInstance('currentCompanyId');

        return ['company' => $company, 'admin' => $admin, 'token' => $this->login("admin@{$slug}.test"), 'year' => $year, 'grade' => $grade, 'section' => $section];
    }

    protected function login(string $login, string $password = 'secret123'): string
    {
        $res = $this->postJson('/api/auth/login', ['login' => $login, 'password' => $password]);
        $res->assertOk();

        return $res->json('token');
    }

    protected function auth(string $token): array
    {
        // The test client caches the resolved user on the guard across requests within a test; without this,
        // a request with a *different* token would still run as the previously authenticated user.
        $this->app['auth']->forgetGuards();
        // Likewise the tenant binding set by the previous request's SetCompanyContext: User is tenant-scoped,
        // so a stale binding from school A makes school B's token resolve to no user (401). A real server
        // gets a fresh process per request; emulate that here.
        $this->app->forgetInstance('currentCompanyId');

        return ['Authorization' => 'Bearer '.$token, 'Accept' => 'application/json'];
    }

    /** A staff user with an explicit permission set (admins bypass permissions). */
    protected function makeStaff(Company $company, array $permissions, string $email): string
    {
        $u = new User(['name' => 'موظف', 'email' => $email, 'role' => 'staff', 'status' => 'active', 'password' => 'secret123', 'permissions' => $permissions]);
        $u->company_id = $company->id;
        $u->save();

        return $this->login($email);
    }
}
