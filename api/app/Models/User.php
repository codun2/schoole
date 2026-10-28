<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use BelongsToCompany, HasApiTokens, Notifiable;

    protected $fillable = ['name', 'name_en', 'email', 'phone', 'role', 'status', 'title', 'title_en', 'photo', 'permissions', 'password'];

    protected $hidden = ['password', 'remember_token'];

    /** Section permissions a school staff member can be granted. */
    public const PERMISSIONS = ['school', 'students', 'finance', 'accounting', 'hr', 'admin_affairs', 'inventory', 'settings', 'users'];

    /** Roles: super (platform owner), admin (school owner/principal), staff, guardian. */
    public function isStaff(): bool
    {
        return in_array($this->role, ['staff', 'admin'], true);
    }

    public function isSuper(): bool
    {
        return $this->role === 'super';
    }

    public function isGuardian(): bool
    {
        return $this->role === 'guardian';
    }

    public function isTeacher(): bool
    {
        return $this->role === 'teacher';
    }

    public function isStudent(): bool
    {
        return $this->role === 'student';
    }

    public function hasPerm(string $key): bool
    {
        if ($this->role === 'admin') {
            return true;
        }

        return $this->isStaff() && in_array($key, $this->permissions ?? [], true);
    }

    protected function casts(): array
    {
        return [
            'password'    => 'hashed',
            'permissions' => 'array',
        ];
    }

    public function guardian()
    {
        return $this->hasOne(Guardian::class);
    }

    /** The employee record a teacher login is attached to. */
    public function employee()
    {
        return $this->hasOne(Employee::class);
    }
}
