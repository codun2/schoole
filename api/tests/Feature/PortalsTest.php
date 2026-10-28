<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesTenant;
use Tests\TestCase;

/** Guardian / student / teacher portals: each sees exactly its own slice, with English names available. */
class PortalsTest extends TestCase
{
    use RefreshDatabase, CreatesTenant;

    public function test_guardian_portal_shows_only_own_children(): void
    {
        $t = $this->makeTenant();
        $h = $this->auth($t['token']);

        $g1 = $this->postJson('/api/app/guardians', ['name' => 'ولي ١', 'name_en' => 'Guardian One', 'phone' => '96891000001', 'password' => 'secret123'], $h)->assertStatus(201)->json();
        $g2 = $this->postJson('/api/app/guardians', ['name' => 'ولي ٢', 'phone' => '96891000002', 'password' => 'secret123'], $h)->assertStatus(201)->json();
        $this->postJson('/api/app/students', ['name' => 'ابن ١', 'name_en' => 'Child One', 'guardian_id' => $g1['id'], 'grade_id' => $t['grade']->id, 'section_id' => $t['section']->id], $h)->assertStatus(201);
        $this->postJson('/api/app/students', ['name' => 'ابن ٢', 'guardian_id' => $g2['id'], 'grade_id' => $t['grade']->id, 'section_id' => $t['section']->id], $h)->assertStatus(201);

        $res = $this->postJson('/api/auth/login', ['login' => '96891000001', 'password' => 'secret123'])->assertOk();
        $this->assertSame('/parent/', $res->json('home'));
        $home = $this->getJson('/api/portal/home', $this->auth($res->json('token')))->assertOk()->json();
        $this->assertCount(1, $home['children']);
        $this->assertSame('Child One', $home['children'][0]['name_en']);
        $this->assertSame('Grade 1', $home['children'][0]['grade']['name_en']);
    }

    public function test_student_portal_login_by_school_number(): void
    {
        $t = $this->makeTenant();
        $h = $this->auth($t['token']);
        $s = $this->postJson('/api/app/students', ['name' => 'جود', 'name_en' => 'Jood', 'grade_id' => $t['grade']->id, 'section_id' => $t['section']->id, 'login_password' => 'secret123'], $h)->assertStatus(201)->json();

        $res = $this->postJson('/api/auth/login', ['login' => $s['student_no'], 'password' => 'secret123'])->assertOk();
        $this->assertSame('/student/', $res->json('home'));
        $home = $this->getJson('/api/student/home', $this->auth($res->json('token')))->assertOk()->json();
        $this->assertSame('Jood', $home['student']['name_en']);
        $this->assertSame('Section A', $home['student']['section']['name_en']);
    }

    public function test_teacher_portal_login_and_home(): void
    {
        $t = $this->makeTenant();
        $h = $this->auth($t['token']);
        $this->postJson('/api/app/employees', ['name' => 'فاطمة', 'name_en' => 'Fatima', 'email' => 'fatima@school-a.test', 'is_teacher' => true, 'basic_salary' => 500, 'status' => 'active', 'login_password' => 'secret123'], $h)->assertStatus(201);

        $res = $this->postJson('/api/auth/login', ['login' => 'fatima@school-a.test', 'password' => 'secret123'])->assertOk();
        $this->assertSame('/teacher/', $res->json('home'));
        $this->getJson('/api/teacher/home', $this->auth($res->json('token')))->assertOk()->assertJsonStructure(['homeroom', 'teaching', 'subjects', 'today', 'stats']);
        $this->getJson('/api/app/students', $this->auth($res->json('token')))->assertStatus(403);
    }
}
