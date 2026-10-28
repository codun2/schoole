<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_login_returns_token_home_and_bilingual_dict(): void
    {
        $t = $this->makeTenant();
        $res = $this->postJson('/api/auth/login', ['login' => 'admin@school-a.test', 'password' => 'secret123'])->assertOk();
        $res->assertJsonPath('home', '/app/')
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.name_en', 'Admin school-a')
            ->assertJsonPath('company.name_en', 'School school-a');
        // school-defined names flow into the translation dictionary
        $this->assertSame('Grade 1', $res->json('dict')['الصف الأول'] ?? null);
        $this->assertSame('Section A', $res->json('dict')['شعبة أ'] ?? null);
    }

    public function test_wrong_password_and_suspended_user_are_rejected(): void
    {
        $t = $this->makeTenant();
        $this->postJson('/api/auth/login', ['login' => 'admin@school-a.test', 'password' => 'nope'])->assertStatus(422);

        $t['admin']->update(['status' => 'suspended']);
        $this->postJson('/api/auth/login', ['login' => 'admin@school-a.test', 'password' => 'secret123'])->assertStatus(422);
    }

    public function test_me_requires_token_and_logout_revokes_it(): void
    {
        $t = $this->makeTenant();
        $this->getJson('/api/auth/me')->assertStatus(401);
        $this->getJson('/api/auth/me', $this->auth($t['token']))->assertOk()->assertJsonPath('user.email', 'admin@school-a.test');

        $this->postJson('/api/auth/logout', [], $this->auth($t['token']))->assertOk();
        $this->getJson('/api/auth/me', $this->auth($t['token']))->assertStatus(401);
    }
}
