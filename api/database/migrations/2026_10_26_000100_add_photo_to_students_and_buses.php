<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('students', 'photo')) {
            Schema::table('students', function (Blueprint $t) {
                $t->string('photo')->nullable()->after('name_en'); // optional web path /storage/students/xxx.jpg
            });
        }
        if (! Schema::hasColumn('buses', 'photo')) {
            Schema::table('buses', function (Blueprint $t) {
                $t->string('photo')->nullable()->after('type'); // optional web path /storage/buses/xxx.jpg
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('buses', 'photo')) {
            Schema::table('buses', fn (Blueprint $t) => $t->dropColumn('photo'));
        }
        // students.photo pre-existed this migration — leave it in place
    }
};
