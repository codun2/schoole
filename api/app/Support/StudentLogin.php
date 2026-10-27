<?php

namespace App\Support;

use App\Models\Student;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Student-portal login (role=student). The username is the student's school number
 * (stored in users.phone so the shared /auth/login "email or phone" lookup finds it);
 * users.email gets a synthetic "<no>@student.local" so the column stays unique.
 */
class StudentLogin
{
    public static function attach(Student $s, string $password): User
    {
        $login = trim((string) $s->student_no);
        if ($login === '') {
            throw ValidationException::withMessages(['login_password' => ['لا يملك الطالب رقماً مدرسياً بعد، احفظه أولاً ثم فعّل الدخول.']]);
        }
        $email = strtolower($login).'@student.local';
        $taken = User::where(fn ($q) => $q->where('email', $email)->orWhere('phone', $login))
            ->when($s->user_id, fn ($q, $uid) => $q->where('id', '!=', $uid))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['login_password' => ['الرقم المدرسي مستخدم لحساب دخول آخر.']]);
        }
        $attrs = ['name' => $s->name, 'phone' => $login, 'email' => $email, 'password' => $password];
        if ($s->user_id && ($u = User::find($s->user_id))) {
            $u->update($attrs);
        } else {
            $u = User::create($attrs + ['role' => 'student', 'status' => 'active']);
            $s->user_id = $u->id;
            $s->save();
        }

        return $u;
    }
}
