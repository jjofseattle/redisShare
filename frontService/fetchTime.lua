if redis.call("EXISTS", KEYS[1]) == 1 then
    if ARGV[1] - redis.call("GET", KEYS[1]) > 5000 then
        redis.call("SET", KEYS[1], ARGV[1]);
        redis.call("SET", KEYS[2], ARGV[2]);
        return true;
    else
        return false 
    end
else
    redis.call("SET", KEYS[1], ARGV[1]);
    redis.call("SET", KEYS[2], ARGV[2]);
    return true;
end
