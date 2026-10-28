<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

class PermissionsTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_staff_permissions_gate_modules_while_admin_bypasses(): void
    {
        $t = $this->makeTenant();
        $hr = $this->makeStaff($t['company'], ['hr'], 'hr@school-a.test');

        // HR-only staff: HR module ok, finance/students forbidden
        $this->getJson('/api/app/employees', $this->auth($hr))->assertOk();
        $this->getJson('/api/app/contracts', $this->auth($hr))->assertStatus(403);
        $this->getJson('/api/app/students', $this->auth($hr))->assertStatus(403);

        // admin: everything
        $this->getJson('/api/app/contracts', $this->auth($t['token']))->assertOk();
        $this->getJson('/api/app/employees', $this->auth($t['token']))->assertOk();
    }

    public function test_portal_roles_cannot_enter_the_admin_app(): void
    {
        $t = $this->makeTenant();
        $g = new User(['name' => 'ولي أمر', 'email' => 'g@school-a.test', 'phone' => '96890000001', 'role' => 'guardian', 'status' => 'active', 'password' => 'secret123']);
        $g->company_id = $t['company']->id;
        $g->save();
        $token = $this->login('96890000001');

        $this->getJson('/api/app/students', $this->auth($token))->assertStatus(403);
        $this->getJson('/api/app/settings', $this->auth($token))->assertStatus(403);
    }
}
