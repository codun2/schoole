<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('buses', function (Blueprint $t) {
            foreach (['type_en'=>'type','driver_name_en'=>'driver_name','supervisor_name_en'=>'supervisor_name','route_en'=>'route'] as $c=>$after)
                if (! Schema::hasColumn('buses', $c)) $t->string($c)->nullable()->after($after);
        });
        if (! Schema::hasColumn('sections', 'room_en')) Schema::table('sections', fn (Blueprint $t) => $t->string('room_en')->nullable()->after('room'));
    }
    public function down(): void {
        Schema::table('buses', function (Blueprint $t) { foreach (['type_en','driver_name_en','supervisor_name_en','route_en'] as $c) if (Schema::hasColumn('buses',$c)) $t->dropColumn($c); });
        if (Schema::hasColumn('sections','room_en')) Schema::table('sections', fn (Blueprint $t) => $t->dropColumn('room_en'));
    }
};
