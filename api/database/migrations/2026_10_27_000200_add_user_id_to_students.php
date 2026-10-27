<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Optional student-portal login: students.user_id → users (role=student, username = student_no). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('students', 'user_id')) {
            Schema::table('students', fn (Blueprint $t) => $t->unsignedBigInteger('user_id')->nullable()->index()->after('guardian_id'));
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('students', 'user_id')) {
            Schema::table('students', fn (Blueprint $t) => $t->dropColumn('user_id'));
        }
    }
};
